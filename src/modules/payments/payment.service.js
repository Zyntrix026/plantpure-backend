import cashfreeService from "../../utils/cashfree.service.js";
import { Order } from "../orders/order.model.js";
import { Cart } from "../cart/cart.model.js";
import { Product } from "../products/product.model.js";
import { haversineDistance, calcCartDeliveryFee } from "../../utils/distance.js";
import { validateCouponService, recordCouponUsageService, rollbackCouponUsageService } from "../coupons/coupon.service.js";

const getStoreCoords = () => ({ lat: parseFloat(process.env.STORE_LAT), lng: parseFloat(process.env.STORE_LNG) });

// ─── 0. Create Cashfree Session from Cart (Registered + Guest) ───────────────
export const createPaymentIntentFromCartService = async (userId, shippingAddress, shippingMethod = "delivery", guestItems = null, couponCode = null, customerDetails = {}) => {
  let rawItems;

  if (userId) {
    const cart = await Cart.findOne({ userId });
    if (!cart || cart.items.length === 0) throw Object.assign(new Error("Your cart is empty"), { statusCode: 400 });
    rawItems = cart.items;
  } else {
    if (!guestItems || guestItems.length === 0) throw Object.assign(new Error("Cart items are required for guest checkout"), { statusCode: 400 });
    rawItems = guestItems;
  }

  const productIds = rawItems.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } }).select("basePrice discountPrice vatPercentage shipping_category status hasVariants variants category");
  const productMap = {};
  products.forEach((p) => (productMap[p._id.toString()] = p));

  const orderItems = rawItems.map((item) => {
    const product = productMap[item.productId.toString()];
    if (!product) throw Object.assign(new Error("Product not found"), { statusCode: 400 });
    if (product.status !== "Active") throw Object.assign(new Error("A product in your cart is no longer available"), { statusCode: 400 });

    let base;
    if (product.hasVariants && item.variantId) {
      const variant = product.variants?.find((v) => v._id.toString() === item.variantId.toString());
      if (!variant) throw Object.assign(new Error("Variant not found for product"), { statusCode: 400 });
      base = variant.discountPrice || variant.price || 0;
    } else {
      base = product.discountPrice || product.basePrice || 0;
    }

    const vat = product.vatPercentage ? (base * product.vatPercentage) / 100 : 0;
    return {
      productId: item.productId,
      variantId: item.variantId || null,
      shipping_category: product.shipping_category ?? "SP",
      priceAtPurchase: Number((base + vat).toFixed(2)),
      baseExVat: base,
      quantity: item.quantity,
      categories: product.category || [],
    };
  });

  // ── Shipping ──────────────────────────────────────────────────────────────
  let shippingPrice = 0;
  if (shippingMethod === "delivery" && shippingAddress?.lat != null && shippingAddress?.lng != null) {
    const { lat: STORE_LAT, lng: STORE_LNG } = getStoreCoords();
    const distanceKm = haversineDistance(STORE_LAT, STORE_LNG, shippingAddress.lat, shippingAddress.lng);
    shippingPrice = calcCartDeliveryFee(orderItems, distanceKm);
  }

  const itemsTotal = parseFloat(orderItems.reduce((acc, i) => acc + i.priceAtPurchase * i.quantity, 0).toFixed(2));
  const itemsTotalExVat = parseFloat(orderItems.reduce((acc, i) => acc + i.baseExVat * i.quantity, 0).toFixed(2));

  // ── Coupon ────────────────────────────────────────────────────────────────
  let discountAmountExVat = 0;
  let discountAmountIncVat = 0;
  let isFreeShipping = false;
  let couponData = null;

  if (couponCode) {
    const isGuest = !userId;
    const cartItemsForValidation = orderItems.map((i) => ({
      productId: i.productId,
      basePrice: i.baseExVat,
      discountPrice: null,
      quantity: i.quantity,
      categories: i.categories,
    }));

    const couponResult = await validateCouponService({
      code: couponCode,
      userId,
      cartItems: cartItemsForValidation,
      cartTotal: itemsTotalExVat,
      isGuest,
    });

    discountAmountExVat = couponResult.discountAmount;
    isFreeShipping = couponResult.isFreeShipping;

    if (discountAmountExVat > 0 && itemsTotalExVat > 0) {
      discountAmountIncVat = parseFloat((discountAmountExVat * (itemsTotal / itemsTotalExVat)).toFixed(2));
    }

    if (isFreeShipping) shippingPrice = 0;

    couponData = {
      couponId: couponResult.coupon._id,
      code: couponResult.coupon.code,
      type: couponResult.coupon.type,
      discountAmount: discountAmountIncVat,
      isFreeShipping,
    };
  }

  const discountedItemsTotal = Math.max(itemsTotal - discountAmountIncVat, 0);
  const totalAmount = parseFloat((discountedItemsTotal + shippingPrice).toFixed(2));

  if (totalAmount <= 0) {
    throw Object.assign(new Error(`Order total ₹${totalAmount.toFixed(2)} is invalid`), { statusCode: 400 });
  }

  // ── Create Cashfree Order ─────────────────────────────────────────────────
  const cfOrderId = `CF_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
  const cfOrder = await cashfreeService.createOrder({
    orderId: cfOrderId,
    amount: totalAmount,
    userId: userId ? userId.toString() : `guest_${Date.now()}`,
    customerName: customerDetails.name || shippingAddress?.fullName || "Customer",
    customerEmail: customerDetails.email || "customer@example.com",
    customerPhone: customerDetails.phone || shippingAddress?.phone || "9999999999",
    redirectUrl: `${process.env.FRONTEND_URL || "http://localhost:5174"}/orders/${cfOrderId}?success=true`,
    orderTags: {
      userId: userId ? userId.toString() : "guest",
      shippingMethod,
      isGuest: userId ? "false" : "true",
      couponCode: couponData?.code || "",
      couponId: couponData?.couponId?.toString() || "",
      discountAmount: discountAmountIncVat.toString(),
      isFreeShipping: isFreeShipping ? "true" : "false",
    },
  });

  return {
    paymentSessionId: cfOrder.payment_session_id,
    orderId: cfOrder.order_id,
    totalAmount,
    coupon: couponData ? {
      code: couponData.code,
      discountAmount: discountAmountIncVat,
      isFreeShipping,
    } : null,
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
