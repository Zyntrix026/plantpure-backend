import Stripe from "stripe";
import { Order } from "../orders/order.model.js";
import { Cart } from "../cart/cart.model.js";
import { Product } from "../products/product.model.js";
import { haversineDistance, calcCartDeliveryFee } from "../../utils/distance.js";
import { validateCouponService, recordCouponUsageService, rollbackCouponUsageService } from "../coupons/coupon.service.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const getStoreCoords = () => ({ lat: parseFloat(process.env.STORE_LAT), lng: parseFloat(process.env.STORE_LNG) });

// ─── 0. Create Payment Intent from Cart (Registered + Guest) ─────────────────
export const createPaymentIntentFromCartService = async (userId, shippingAddress, shippingMethod = "delivery", guestItems = null, couponCode = null) => {
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
      priceAtPurchase: Number((base + vat).toFixed(2)),  // inc-VAT
      baseExVat: base,                                    // ex-VAT for coupon calc
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

  // inc-VAT items total
  const itemsTotal = parseFloat(orderItems.reduce((acc, i) => acc + i.priceAtPurchase * i.quantity, 0).toFixed(2));
  // ex-VAT items total (used as coupon base)
  const itemsTotalExVat = parseFloat(orderItems.reduce((acc, i) => acc + i.baseExVat * i.quantity, 0).toFixed(2));

  // ── Coupon Validation ─────────────────────────────────────────────────────
  let discountAmountExVat = 0;  // raw discount from coupon service (ex-VAT basis)
  let discountAmountIncVat = 0; // scaled to inc-VAT for actual deduction
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
    isFreeShipping      = couponResult.isFreeShipping;

    // Scale ex-VAT discount to inc-VAT proportionally
    // e.g. ex-VAT total = £60, inc-VAT total = £72, discount ex = £5 → discount inc = £6
    if (discountAmountExVat > 0 && itemsTotalExVat > 0) {
      discountAmountIncVat = parseFloat((discountAmountExVat * (itemsTotal / itemsTotalExVat)).toFixed(2));
    }

    if (isFreeShipping) shippingPrice = 0;

    couponData = {
      couponId:       couponResult.coupon._id,
      code:           couponResult.coupon.code,
      type:           couponResult.coupon.type,
      discountAmount: discountAmountIncVat,  // inc-VAT — what customer actually saves
      isFreeShipping,
    };
  }

  // ── Final total ───────────────────────────────────────────────────────────
  const discountedItemsTotal = Math.max(itemsTotal - discountAmountIncVat, 0);
  const totalAmount = parseFloat((discountedItemsTotal + shippingPrice).toFixed(2));

  if (totalAmount < 0.30) {
    throw Object.assign(new Error(`Order total £${totalAmount.toFixed(2)} is below the minimum charge of £0.30`), { statusCode: 400 });
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(totalAmount * 100),
    currency: "gbp",
    metadata: {
      userId:             userId ? userId.toString() : "guest",
      shippingMethod,
      isGuest:            userId ? "false" : "true",
      couponCode:         couponData?.code || "",
      couponId:           couponData?.couponId?.toString() || "",
      // Store inc-VAT discount — this is what gets recorded in CouponUsage
      discountAmount:     discountAmountIncVat.toString(),
      isFreeShipping:     isFreeShipping ? "true" : "false",
    },
  });

  return {
    clientSecret:   paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    totalAmount,
    coupon: couponData ? {
      code:           couponData.code,
      discountAmount: discountAmountIncVat,  // inc-VAT — matches what Stripe charged
      isFreeShipping,
    } : null,
  };
};

// ─── 1. Create Payment Intent (legacy — order already exists) ────────────────
export const createPaymentIntentService = async (orderId, userId) => {
  const order = await Order.findById(orderId);

  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  if (order.userId.toString() !== userId.toString()) throw Object.assign(new Error("Access denied"), { statusCode: 403 });
  if (order.paymentStatus === "paid") throw Object.assign(new Error("Order is already paid"), { statusCode: 400 });
  if (order.paymentMethod !== "Stripe") throw Object.assign(new Error("This order is not a Stripe order"), { statusCode: 400 });

  if (order.paymentIntentId) {
    const existingIntent = await stripe.paymentIntents.retrieve(order.paymentIntentId);
    if (existingIntent.status === "canceled") {
      order.paymentIntentId = null;
      await order.save();
    } else {
      return { clientSecret: existingIntent.client_secret, orderId: order._id };
    }
  }

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: Math.round(order.totalPrice * 100),
      currency: "gbp",
      metadata: {
        orderId:     order._id.toString(),
        orderNumber: order.orderNumber,
        userId:      userId.toString(),
      },
    },
    { idempotencyKey: `order_${order._id}` }
  );

  order.paymentIntentId = paymentIntent.id;
  await order.save();

  return { clientSecret: paymentIntent.client_secret, orderId: order._id };
};

// ─── 2. Handle Stripe Webhook ─────────────────────────────────────────────────
export const handleWebhookService = async (rawBody, signature) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    throw Object.assign(new Error("Webhook signature verification failed"), { statusCode: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const orderId = intent.metadata.orderId;
    const order = await Order.findById(orderId);

    if (order && order.paymentStatus !== "paid") {
      order.paymentStatus = "paid";
      order.orderStatus   = "confirmed";
      order.paymentIntentId = intent.id;
      order.paymentResult = { gatewayPaymentId: intent.id, paidAt: new Date() };
      order.statusHistory.push({ status: "confirmed", note: "Payment received via Stripe" });
      await order.save();

      const { couponCode, couponId, discountAmount } = intent.metadata;
      if (couponCode && couponId && parseFloat(discountAmount) > 0) {
        try {
          await recordCouponUsageService({
            couponId,
            couponCode,
            userId:         intent.metadata.userId !== "guest" ? intent.metadata.userId : null,
            orderId:        order._id,
            guestEmail:     order.guestEmail || null,
            discountAmount: parseFloat(discountAmount),
          });
        } catch (couponErr) {
          console.error("Coupon usage recording failed:", couponErr.message);
        }
      }
    }
  }

  if (event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    const order  = await Order.findOne({ paymentIntentId: intent.id });

    if (order) {
      order.paymentStatus = "failed";
      await order.save();

      const { couponId, discountAmount } = intent.metadata;
      if (couponId && parseFloat(discountAmount) > 0) {
        try {
          await rollbackCouponUsageService({
            couponId,
            discountAmount: parseFloat(discountAmount),
            orderId: order._id,
          });
        } catch (rollbackErr) {
          console.error("Coupon rollback failed:", rollbackErr.message);
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
    orderId:       order._id,
    orderNumber:   order.orderNumber,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus:   order.orderStatus,
    totalPrice:    order.totalPrice,
  };
};
