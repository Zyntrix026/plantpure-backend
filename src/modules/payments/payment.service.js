import CashfreeService from '../../utils/cashfree.service.js'; // 👈 Path check kar lena aapke folder structure ke hisab se
import { Order } from "../orders/order.model.js";
import { Cart } from "../cart/cart.model.js";
import { Product } from "../products/product.model.js";
import { haversineDistance, calcCartDeliveryFee } from "../../utils/distance.js";
import { validateCouponService, recordCouponUsageService, rollbackCouponUsageService } from "../coupons/coupon.service.js";

const getStoreCoords = () => ({ lat: parseFloat(process.env.STORE_LAT), lng: parseFloat(process.env.STORE_LNG) });

// ─── 0. Create Cashfree Session from Cart (Registered + Guest) ───────────────
// backend/services/paymentService.js (ya jahan createPaymentIntentFromCartService define hai)

export const createPaymentIntentFromCartService = async (
  userId,
  shippingAddress,
  shippingMethod = "delivery",
  orderIdParam = null,
  couponCode = null,
  customerDetails = {}
) => {
  // 1. Fetch User Cart or Guest Cart
  const cart = await Cart.findOne({ user: userId }).populate('items.product');
  if (!cart || cart.items.length === 0) {
    throw new Error("Cart is empty. Cannot initiate payment.");
  }

  // 2. Calculate Total Amount from Cart
  let calculatedTotal = cart.items.reduce((sum, item) => {
    const price = item.product?.price || item.price || 0;
    return sum + (price * item.quantity);
  }, 0);

  // Apply Shipping Charge if needed
  if (shippingMethod === "delivery") {
    const shippingCharge = 50; // Ya jo aapka shipping cost ho
    calculatedTotal += shippingCharge;
  }

  // Final Total Amount
  const totalAmount = Number(calculatedTotal.toFixed(2));

  // 3. Clean Customer Details
  const customerName = shippingAddress?.fullName || customerDetails?.name || "Customer";
  const customerEmail = shippingAddress?.email || customerDetails?.email || "customer@example.com";
  const customerPhone = shippingAddress?.phone || customerDetails?.phone || "9999999999";

  // 4. Order ID Generation
  const cfOrderId = orderIdParam || `CF_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

  // 5. Cashfree Localhost Placeholder Fix
  const redirectUrl = "http://localhost:5174/orders/{order_id}?success=true";

  // 6. Call Cashfree Service
  const cashfreeResponse = await CashfreeService.createOrder({
    amount: totalAmount, // ✅ Ab totalAmount properly calculated hai!
    userId: userId || `GUEST_${Date.now()}`,
    customerName,
    customerEmail,
    customerPhone,
    orderId: cfOrderId,
    redirectUrl: redirectUrl,
    orderTags: {
      userId: userId ? String(userId) : "guest",
      shippingMethod,
      couponCode: couponCode || "",
    },
  });

  return {
    paymentSessionId: cashfreeResponse.payment_session_id,
    orderId: cashfreeResponse.order_id,
  };
};

// ─── 1. Create Session for existing order (legacy) ───────────────────────────
export const createPaymentIntentService = async (orderId, userId) => {
  const order = await Order.findById(orderId);

  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  if (order.userId.toString() !== userId.toString()) throw Object.assign(new Error("Access denied"), { statusCode: 403 });
  if (order.paymentStatus === "paid") throw Object.assign(new Error("Order is already paid"), { statusCode: 400 });

  const cfOrderId = `CF_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
  const cfOrder = await cashfreeService.createOrder({
    orderId: cfOrderId,
    amount: order.totalPrice,
    userId: userId.toString(),
    customerName: order.shippingAddress?.fullName || "Customer",
    customerEmail: "customer@example.com",
    customerPhone: order.shippingAddress?.phone || "9999999999",
    redirectUrl: `${process.env.FRONTEND_URL || "http://localhost:5174"}/orders/${cfOrderId}?success=true`,
    orderTags: {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: userId.toString(),
    },
  });

  order.cfOrderId = cfOrder.order_id;
  await order.save();

  return { paymentSessionId: cfOrder.payment_session_id, orderId: order._id, cfOrderId: cfOrder.order_id };
};

// ─── 2. Handle Cashfree Webhook ───────────────────────────────────────────────
export const handleWebhookService = async (body, signature, timestamp) => {
  // Cashfree webhook signature verification
  const crypto = await import("crypto");
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const signedPayload = timestamp + rawBody;
  const expectedSignature = crypto.default
    .createHmac("sha256", process.env.CASHFREE_SECRET_KEY)
    .update(signedPayload)
    .digest("base64");

  if (signature !== expectedSignature) {
    throw Object.assign(new Error("Webhook signature verification failed"), { statusCode: 400 });
  }

  const event = typeof body === "string" ? JSON.parse(body) : body;
  const eventType = event.type;
  const data = event.data;

  if (eventType === "PAYMENT_SUCCESS") {
    const cfOrderId = data.order?.order_id;
    const order = await Order.findOne({ cfOrderId });

    if (order && order.paymentStatus !== "paid") {
      order.paymentStatus = "paid";
      order.orderStatus = "confirmed";
      order.paymentResult = { gatewayPaymentId: data.payment?.cf_payment_id?.toString(), paidAt: new Date() };
      order.statusHistory.push({ status: "confirmed", note: "Payment received via Cashfree" });
      await order.save();

      const tags = data.order?.order_tags || {};
      const { couponCode, couponId, discountAmount } = tags;
      if (couponCode && couponId && parseFloat(discountAmount) > 0) {
        try {
          await recordCouponUsageService({
            couponId,
            couponCode,
            userId: tags.userId !== "guest" ? tags.userId : null,
            orderId: order._id,
            guestEmail: order.guestEmail || null,
            discountAmount: parseFloat(discountAmount),
          });
        } catch (err) {
          console.error("Coupon usage recording failed:", err.message);
        }
      }
    }
  }

  if (eventType === "PAYMENT_FAILED") {
    const cfOrderId = data.order?.order_id;
    const order = await Order.findOne({ cfOrderId });
    if (order) {
      order.paymentStatus = "failed";
      await order.save();

      const tags = data.order?.order_tags || {};
      const { couponId, discountAmount } = tags;
      if (couponId && parseFloat(discountAmount) > 0) {
        try {
          await rollbackCouponUsageService({
            couponId,
            discountAmount: parseFloat(discountAmount),
            orderId: order._id,
          });
        } catch (err) {
          console.error("Coupon rollback failed:", err.message);
        }
      }
    }
  }

  return { received: true };
};

// ─── 3. Get Payment Status ────────────────────────────────────────────────────
export const getPaymentStatusService = async (orderId, userId, role) => {
  const order = await Order.findById(orderId).select(
    "orderNumber paymentStatus paymentMethod totalPrice orderStatus userId isGuest"
  );

  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });

  if (role === "customer" && order.userId?.toString() !== userId.toString())
    throw Object.assign(new Error("Access denied"), { statusCode: 403 });

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    totalPrice: order.totalPrice,
  };
};
