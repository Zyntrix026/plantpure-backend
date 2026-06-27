import mongoose from "mongoose";
import { Order } from "./order.model.js";
import { Cart } from "../cart/cart.model.js";
import { Product } from "../products/product.model.js";
import User from "../users/user.model.js";
import { checkAndNotifyStockOut, checkAndRefillStock } from "../../utils/autoStockRefill.js";
import {
  validateDeliveryRange,
  haversineDistance,
  calcCartDeliveryFee,
} from "../../utils/distance.js";
import { sendOrderConfirmationToUser, sendNewOrderAlertToAdmin, sendCancellationEmailToCustomer, sendCancellationAlertToAdmin, sendReadyForPickupEmail, sendOrderDeliveredEmail } from "../../utils/email.service.js";
import { recordCouponUsageService } from "../coupons/coupon.service.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TAX_RATE = 0.0;
const getStoreCoords = () => ({ lat: parseFloat(process.env.STORE_LAT), lng: parseFloat(process.env.STORE_LNG) });

const calcPrices = (items, shippingPrice) => {
  const itemsPrice = items.reduce(
    (acc, item) => acc + item.priceAtPurchase * item.quantity,
    0,
  );
  const taxPrice = parseFloat((itemsPrice * TAX_RATE).toFixed(2));
  const totalPrice = parseFloat(
    (itemsPrice + shippingPrice + taxPrice).toFixed(2),
  );
  return {
    itemsPrice: parseFloat(itemsPrice.toFixed(2)),
    shippingPrice,
    taxPrice,
    totalPrice,
  };
};

// ─── 1. Create Order ──────────────────────────────────────────────────────────

export const createOrderService = async (
  userId,
  shippingAddress,
  paymentMethod,
  shippingMethod = "delivery",
) => {
  // 1. Fetch cart
  const cart = await Cart.findOne({ userId });
  if (!cart || cart.items.length === 0) throw new Error("Your cart is empty");

  // 2. Fetch all products in one query
  const productIds = cart.items.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } }).select(
    "title sku stock status images basePrice vatPercentage shipping_category hasVariants variants",
  );

  const productMap = {};
  products.forEach((p) => (productMap[p._id.toString()] = p));

  // 3. Validate stock
  const stockErrors = [];
  for (const item of cart.items) {
    const product = productMap[item.productId.toString()];
    if (!product) {
      stockErrors.push(`Product "${item.name}" no longer exists`);
      continue;
    }
    if (product.status !== "Active") {
      stockErrors.push(`"${product.title}" is no longer available`);
      continue;
    }
    let availableStock;
    if (product.hasVariants && item.variantId) {
      const variant = product.variants.find((v) => v._id.toString() === item.variantId.toString());
      if (!variant) { stockErrors.push(`Variant not found for "${item.name}"`); continue; }
      availableStock = variant.stock;
    } else {
      availableStock = product.stock;
    }
    if (availableStock < item.quantity) {
      stockErrors.push(`${item.name} has only ${availableStock} unit(s) in stock (requested: ${item.quantity})`);
    }
  }
  if (stockErrors.length > 0) throw new Error(stockErrors.join(" | "));

  // 4. Build price-snapshotted order items
  const orderItems = cart.items.map((item) => {
    const product = productMap[item.productId.toString()];
    let base, sku;
    if (product.hasVariants && item.variantId) {
      const variant = product.variants.find((v) => v._id.toString() === item.variantId.toString());
      base = variant.discountPrice ?? variant.price;
      sku = variant.sku || product.sku;
    } else {
      base = product.discountPrice ?? product.basePrice;
      sku = product.sku;
    }
    const vat = product.vatPercentage ? (base * product.vatPercentage) / 100 : 0;
    return {
      productId: item.productId,
      variantId: (product.hasVariants && item.variantId) ? item.variantId : null,
      name: item.name,
      sku,
      quantity: item.quantity,
      image: product.images?.[0]?.url || "",
      vatPercentage: product.vatPercentage ?? 0,
      shipping_category: product.shipping_category ?? "SP",
      priceAtPurchase: Number((base + vat).toFixed(2)),
    };
  });

  // 5. Calculate shipping
  let shippingPrice = 0;
  if (shippingMethod === "delivery") {
    if (shippingAddress.lat == null || shippingAddress.lng == null) {
      throw Object.assign(new Error("lat and lng are required in shippingAddress for delivery"), { statusCode: 400 });
    }
    const { lat: STORE_LAT, lng: STORE_LNG } = getStoreCoords();
    const distanceKm = haversineDistance(STORE_LAT, STORE_LNG, shippingAddress.lat, shippingAddress.lng);
    validateDeliveryRange(shippingAddress.lat, shippingAddress.lng);
    shippingPrice = calcCartDeliveryFee(orderItems, distanceKm);
  }
  // store_pickup: shippingPrice stays 0

  // 6. Calculate prices
  const { itemsPrice, taxPrice, totalPrice } = calcPrices(orderItems, shippingPrice);

  // 7. Create order
  const order = await Order.create({
    userId,
    orderItems,
    shippingAddress,
    shippingMethod,
    paymentMethod,
    paymentStatus: "pending",
    orderStatus: "pending",
    itemsPrice,
    shippingPrice,
    taxPrice,
    totalPrice,
    statusHistory: [{ status: "pending", note: "Order placed" }],
  });

  // 8. Deduct stock — variant or simple
  await Product.bulkWrite(
    cart.items.map((item) => {
      if (item.variantId) {
        return {
          updateOne: {
            filter: { _id: item.productId, "variants._id": item.variantId },
            update: { $inc: { "variants.$.stock": -item.quantity } },
          },
        };
      }
      return {
        updateOne: {
          filter: { _id: item.productId },
          update: { $inc: { stock: -item.quantity } },
        },
      };
    }),
  );

  // 9. Clear cart
  await Cart.findOneAndUpdate(
    { userId },
    { $set: { items: [], totalPrice: 0, totalSavings: 0 } },
  );

  // 9b. Auto-refill stock if any item reached 0
  await checkAndNotifyStockOut(order.orderItems);

  // 10. Send emails
  try {
    const user = await User.findById(userId).select("email name").lean();
    if (user?.email) {
      await Promise.all([
        sendOrderConfirmationToUser(user.email, user.name, order),
        sendNewOrderAlertToAdmin(user.email, user.name, order),
      ]);
    }
  } catch (emailErr) {
    console.error("Email sending failed:", emailErr.message);
  }

  return order;
};

// ─── 2. Get My Orders (User) ─────────────────────────────────────────────────

export const getMyOrdersService = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find({ userId })
      .select(
        "orderNumber orderStatus paymentStatus paymentMethod totalPrice createdAt orderItems cancellationStatus cancellationReason cancellationRejectionReason",
      )
      .sort("-createdAt")
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Order.countDocuments({ userId }),
  ]);

  const formatted = orders.map((o) => ({
    ...o,
    thumbnail: o.orderItems?.[0]?.image || null,
    itemCount: o.orderItems?.length || 0,
  }));

  return {
    orders: formatted,
    totalOrders: total,
    totalPages: Math.ceil(total / limit),
    currentPage: parseInt(page),
  };
};

// ─── 3. Get Single Order by ID ───────────────────────────────────────────────

export const getOrderByIdService = async (orderId, userId, role) => {
  if (!mongoose.Types.ObjectId.isValid(orderId))
    throw new Error("Invalid order ID");

  const order = await Order.findById(orderId)
    .populate("userId", "name email phone")
    .populate("orderItems.productId", "title slug")
    .lean();

  if (!order) throw new Error("Order not found");

  if (
    role === "customer" &&
    order.userId._id.toString() !== userId.toString()
  ) {
    throw new Error("Access denied");
  }

  return order;
};

// ─── 4. Get All Orders (Admin) ───────────────────────────────────────────────

export const getAllOrdersService = async (
  filters = {},
  page = 1,
  limit = 20,
) => {
  const { 
    orderStatus, 
    paymentStatus, 
    shippingMethod, // Destructure kiya
    search, 
    startDate, 
    endDate 
  } = filters;
  
  const query = {};

  // Filters logic
  if (orderStatus && orderStatus !== "all") query.orderStatus = orderStatus;
  if (paymentStatus && paymentStatus !== "all") query.paymentStatus = paymentStatus;
  
  // Shipping Method Filter (Naya Logic)
  if (shippingMethod && shippingMethod !== "all") {
    query.shippingMethod = shippingMethod;
  }

  // Date Range Filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Search logic
  if (search) {
    query.$or = [{ orderNumber: { $regex: search, $options: "i" } }];
  }

  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate("userId", "name email")
      .select(
        "orderNumber userId isGuest guestEmail shippingAddress orderStatus paymentStatus paymentMethod shippingMethod totalPrice createdAt orderItems"
      )
      .sort("-createdAt")
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Order.countDocuments(query),
  ]);

  return {
    orders,
    totalOrders: total,
    totalPages: Math.ceil(total / limit),
    currentPage: parseInt(page),
  };
};

// ─── 5. Update Order Status (Admin) ──────────────────────────────────────────

// Delivery flow:  pending → confirmed → processing → shipped → out_for_delivery → delivered
// Pickup flow:    pending → confirmed → processing → ready_for_pickup → picked_up
const VALID_TRANSITIONS = {
  pending:          ["confirmed", "cancelled"],
  confirmed:        ["processing", "cancelled"],
  processing:       ["shipped", "ready_for_pickup", "cancelled"],
  shipped:          ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered:        [],
  ready_for_pickup: ["picked_up", "cancelled"],
  picked_up:        [],
  cancelled:        [],
};

// export const updateOrderStatusService = async (orderId, newStatus, adminId, note = "", extraData = {}) => {
//   if (!mongoose.Types.ObjectId.isValid(orderId)) throw new Error("Invalid order ID");

//   const order = await Order.findById(orderId);
//   if (!order) throw new Error("Order not found");

//   const allowedNext = VALID_TRANSITIONS[order.orderStatus];
//   if (!allowedNext.includes(newStatus)) {
//     throw new Error(
//       `Cannot transition from "${order.orderStatus}" to "${newStatus}". Allowed: ${allowedNext.join(", ") || "none"}`,
//     );
//   }

//   order.orderStatus = newStatus;
//   order.statusHistory.push({ status: newStatus, changedBy: adminId, note });

//   const now = new Date();

//   // Auto-stamp tracking timestamps + attach courier info if provided
//   if (newStatus === "shipped") {
//     order.trackingDetails = {
//       ...order.trackingDetails?.toObject?.() ?? {},
//       shippedAt: now,
//       trackingNumber: extraData.trackingNumber || order.trackingDetails?.trackingNumber || null,
//       courierName: extraData.courierName || order.trackingDetails?.courierName || null,
//       trackingUrl: extraData.trackingUrl || order.trackingDetails?.trackingUrl || null,
//       estimatedDeliveryDate: extraData.estimatedDeliveryDate || order.trackingDetails?.estimatedDeliveryDate || null,
//     };
//   }
//   if (newStatus === "out_for_delivery") {
//     order.trackingDetails = { ...order.trackingDetails?.toObject?.() ?? {}, outForDeliveryAt: now };
//   }
//   if (newStatus === "delivered") {
//     order.trackingDetails = { ...order.trackingDetails?.toObject?.() ?? {}, deliveredAt: now };
//     if (order.paymentMethod === "COD") {
//       order.paymentStatus = "paid";
//       order.paymentResult = { ...order.paymentResult, paidAt: now };
//     }
//   }
//   if (newStatus === "ready_for_pickup") {
//     // Generate a simple 6-char alphanumeric pickup code if not set
//     if (!order.pickupDetails?.pickupCode) {
//       order.pickupDetails = {
//         ...order.pickupDetails?.toObject?.() ?? {},
//         pickupCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
//       };
//     }
//   }
//   if (newStatus === "picked_up") {
//     order.pickupDetails = {
//       ...order.pickupDetails?.toObject?.() ?? {},
//       pickedUpAt: now,
//       pickedUpBy: extraData.pickedUpBy || null,
//     };
//   }

//   await order.save();
//   return order;
// };

export const updateOrderStatusService = async (orderId, newStatus, adminId, note = "", extraData = {}) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("Invalid order ID");
  }

  const order = await Order.findById(orderId);
  if (!order) {
    throw new Error("Order not found");
  }

  const allowedNext = VALID_TRANSITIONS[order.orderStatus];
  if (!allowedNext.includes(newStatus)) {
    throw new Error(
      `Cannot transition from "${order.orderStatus}" to "${newStatus}". Allowed: ${allowedNext.join(", ") || "none"}`,
    );
  }

  order.orderStatus = newStatus;
  order.statusHistory.push({ status: newStatus, changedBy: adminId, note });

  const now = new Date();

  if (newStatus === "shipped") {
    order.trackingDetails = {
      ...order.trackingDetails?.toObject?.() ?? {},
      shippedAt: now,
      trackingNumber: extraData.trackingNumber || order.trackingDetails?.trackingNumber || null,
      courierName: extraData.courierName || order.trackingDetails?.courierName || null,
      trackingUrl: extraData.trackingUrl || order.trackingDetails?.trackingUrl || null,
      estimatedDeliveryDate: extraData.estimatedDeliveryDate || order.trackingDetails?.estimatedDeliveryDate || null,
    };
  }
  
  if (newStatus === "out_for_delivery") {
    order.trackingDetails = { 
      ...order.trackingDetails?.toObject?.() ?? {}, 
      outForDeliveryAt: now 
    };
  }
  
  if (newStatus === "delivered") {
    order.trackingDetails = { 
      ...order.trackingDetails?.toObject?.() ?? {}, 
      deliveredAt: now 
    };
    if (order.paymentMethod === "COD") {
      order.paymentStatus = "paid";
      order.paymentResult = { ...order.paymentResult, paidAt: now };
    }
  }
  
  if (newStatus === "ready_for_pickup") {
    if (!order.pickupDetails?.pickupCode) {
      order.pickupDetails = {
        ...order.pickupDetails?.toObject?.() ?? {},
        pickupCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      };
    }
  }
  
  if (newStatus === "picked_up") {
    order.pickupDetails = {
      ...order.pickupDetails?.toObject?.() ?? {},
      pickedUpAt: now,
      pickedUpBy: extraData.pickedUpBy || null,
    };
  }

  await order.save();

  if (newStatus === "ready_for_pickup" || newStatus === "delivered") {
    try {
      let userEmail, userName;
      if (order.isGuest) {
        userEmail = order.guestEmail;
        userName  = order.shippingAddress?.fullName || "Valued Customer";
      } else {
        const user = await User.findById(order.userId).select("email name").lean();
        userEmail = user?.email;
        userName  = user?.name || order.shippingAddress?.fullName || "Valued Customer";
      }

      if (userEmail) {
        if (newStatus === "ready_for_pickup") {
          await sendReadyForPickupEmail(order, userEmail, userName);
        } else {
          await sendOrderDeliveredEmail(order, userEmail, userName);
        }
      }
    } catch (emailError) {
      console.error(`Error sending ${newStatus} email:`, emailError.message);
    }
  }

  return order;
};

// ─── 6. Cancel Order (with Stripe Refund) ────────────────────────────────────

// Statuses from which cancellation is allowed per shipping method
const CANCELLABLE_DELIVERY = new Set(["pending", "confirmed", "processing"]);
const CANCELLABLE_PICKUP   = new Set(["pending", "confirmed", "processing", "ready_for_pickup"]);

export const cancelOrderService = async (orderId, requesterId, role, reason = "") => {
  if (!mongoose.Types.ObjectId.isValid(orderId))
    throw Object.assign(new Error("Invalid order ID"), { statusCode: 400 });

  const order = await Order.findById(orderId);
  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });

  // ── 1. Ownership check (customers can only cancel their own orders) ──
  if (role === "customer") {
    const ownerId = order.isGuest ? null : order.userId?.toString();
    if (!ownerId || ownerId !== requesterId.toString())
      throw Object.assign(new Error("Access denied"), { statusCode: 403 });
  }

  // ── 2. Already cancelled guard ──
  if (order.orderStatus === "cancelled")
    throw Object.assign(new Error("Order is already cancelled"), { statusCode: 400 });

  // ── 3. Status transition guard per shippingMethod ──
  const allowedSet = order.shippingMethod === "store_pickup" ? CANCELLABLE_PICKUP : CANCELLABLE_DELIVERY;
  if (!allowedSet.has(order.orderStatus)) {
    throw Object.assign(
      new Error(`Cannot cancel a ${order.shippingMethod === "store_pickup" ? "pickup" : "delivery"} order at "${order.orderStatus}" stage`),
      { statusCode: 400 }
    );
  }

  // ── 4. Stripe refund (only if payment was made) ──
  let stripeRefundId = null;
  if (order.paymentStatus === "paid" && order.paymentIntentId) {
    // Duplicate refund guard — check if refund already exists
    if (order.paymentStatus === "refunded")
      throw Object.assign(new Error("Refund already processed for this order"), { statusCode: 400 });

    try {
      const refund = await stripe.refunds.create({
        payment_intent: order.paymentIntentId,
        reason: "requested_by_customer",
        metadata: { orderId: order._id.toString(), orderNumber: order.orderNumber },
      });
      stripeRefundId = refund.id;
      order.paymentStatus = "refunded";
      order.paymentResult = {
        ...order.paymentResult?.toObject?.() ?? {},
        refundId: refund.id,
        refundedAt: new Date(),
      };
    } catch (stripeErr) {
      // Surface Stripe errors clearly
      throw Object.assign(
        new Error(`Stripe refund failed: ${stripeErr.message}`),
        { statusCode: 502 }
      );
    }
  }

  // ── 5. Restore inventory ──
  await Product.bulkWrite(
    order.orderItems.map((item) =>
      item.variantId
        ? {
            updateOne: {
              filter: { _id: item.productId, "variants._id": item.variantId },
              update: { $inc: { "variants.$.stock": item.quantity } },
            },
          }
        : {
            updateOne: {
              filter: { _id: item.productId },
              update: { $inc: { stock: item.quantity } },
            },
          }
    )
  );

  // ── 6. Update order fields ──
  const now = new Date();
  order.orderStatus       = "cancelled";
  order.cancelledAt       = now;
  order.cancellationReason = reason || "No reason provided";
  order.cancelledBy       = role === "customer" ? requesterId : requesterId;
  order.statusHistory.push({
    status: "cancelled",
    changedBy: role === "customer" ? requesterId : requesterId,
    note: reason || (role === "admin" ? "Cancelled by admin" : "Cancelled by customer"),
    changedAt: now,
  });

  await order.save();

  // ── 7. Send emails (non-blocking) ──
  try {
    let emailTo, nameTo;
    if (order.isGuest) {
      emailTo = order.guestEmail;
      nameTo  = order.shippingAddress?.fullName || "Customer";
    } else {
      const user = await User.findById(order.userId).select("email name").lean();
      emailTo = user?.email;
      nameTo  = user?.name || "Customer";
    }
    const cancelledByLabel = role === "admin" ? "Admin" : (nameTo || "Customer");
    if (emailTo) {
      await Promise.all([
        sendCancellationEmailToCustomer(emailTo, nameTo, order, order.totalPrice),
        sendCancellationAlertToAdmin(order, stripeRefundId, cancelledByLabel),
      ]);
    }
  } catch (emailErr) {
    console.error("Cancellation email failed:", emailErr.message);
  }

  return {
    order,
    refundId: stripeRefundId,
    refundAmount: order.totalPrice,
  };
};



// cancel request order service

export const requestCancellationService = async (orderId, requesterId, reason) => {
  // console.log("Requesting cancellation for order:", orderId, "by user:", requesterId, "Reason:", reason);
  if (!mongoose.Types.ObjectId.isValid(orderId))
    throw Object.assign(new Error("Invalid order ID"), { statusCode: 400 });

  const order = await Order.findById(orderId);
  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });

  // 1. Ownership check (Sirf wahi user request kar sakta hai jisne order kiya)
  const ownerId = order.isGuest ? null : order.userId?.toString();
  if (!ownerId || ownerId !== requesterId.toString())
    throw Object.assign(new Error("Access denied"), { statusCode: 403 });

  // 2. Guard: Agar order pehle se hi cancelled hai ya process ho chuka hai
  if (order.orderStatus === "cancelled" || order.orderStatus === "delivered") {
    throw Object.assign(new Error(`Cannot request cancellation. Order is already ${order.orderStatus}`), { statusCode: 400 });
  }

  // 3. Guard: Agar request pehle se pending hai
  if (order.cancellationStatus === "pending") {
    throw Object.assign(new Error("Cancellation request is already pending for this order"), { statusCode: 400 });
  }

  // 4. Update cancellation request details
  order.cancellationStatus = "pending";
  order.cancellationReason = reason;
  order.cancellationRequestedAt = new Date();

  // History track karne ke liye
  order.statusHistory.push({
    status: order.orderStatus,
    changedBy: requesterId,
    note: `Cancellation requested by customer. Reason: ${reason}`,
    changedAt: new Date(),
  });

  await order.save();
  
  // (Optional) Yahan aap Admin ko alert email bhej sakte hain ki naya request aaya hai.

  return order;
};

// ─── 7. Admin Dashboard Stats ────────────────────────────────────────────────

export const getOrderStatsService = async () => {
  const [statusStats, revenueStats] = await Promise.all([
    Order.aggregate([{ $group: { _id: "$orderStatus", count: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { paymentStatus: "paid" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalPrice" },
          totalOrders: { $sum: 1 },
        },
      },
    ]),
  ]);

  const stats = {
    pending: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };
  statusStats.forEach((s) => (stats[s._id] = s.count));

  return {
    ordersByStatus: stats,
    totalRevenue: revenueStats[0]?.totalRevenue || 0,
    totalPaidOrders: revenueStats[0]?.totalOrders || 0,
  };
};

// ─── 8a. Create Order After Payment (Payment-First Flow) ────────────────────

import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const createOrderAfterPaymentService = async (userId, paymentIntentId, shippingAddress, shippingMethod = "delivery", guestData = null) => {
  // 1. Verify payment with Stripe
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (!intent || intent.status !== "succeeded") {
    throw Object.assign(new Error("Payment not completed. Please complete payment first."), { statusCode: 400 });
  }

  // 2. Idempotency
  const existing = await Order.findOne({ paymentIntentId });
  if (existing) return existing;

  const isGuest = !userId;

  // 3. Get raw items — registered: cart DB, guest: guestData.items
  let rawItems;
  if (!isGuest) {
    const cart = await Cart.findOne({ userId });
    if (!cart || cart.items.length === 0) throw new Error("Your cart is empty");
    rawItems = cart.items;
  } else {
    if (!guestData?.items || guestData.items.length === 0) throw new Error("Cart items are required");
    if (!guestData?.guestEmail) throw Object.assign(new Error("Email is required for guest checkout"), { statusCode: 400 });
    rawItems = guestData.items;
  }

  const productIds = rawItems.map((i) => i.productId);
  const products = await Product.find({ _id: { $in: productIds } }).select(
    "title sku stock status images basePrice vatPercentage shipping_category hasVariants variants",
  );
  const productMap = {};
  products.forEach((p) => (productMap[p._id.toString()] = p));

  // 4. Validate stock
  const stockErrors = [];
  for (const item of rawItems) {
    const product = productMap[item.productId.toString()];
    if (!product) { stockErrors.push(`Product "${item.name}" no longer exists`); continue; }
    if (product.status !== "Active") { stockErrors.push(`"${product.title}" is no longer available`); continue; }
    let availableStock;
    if (product.hasVariants && item.variantId) {
      const variant = product.variants.find((v) => v._id.toString() === item.variantId.toString());
      if (!variant) { stockErrors.push(`Variant not found for "${item.name}"`); continue; }
      availableStock = variant.stock;
    } else {
      availableStock = product.stock;
    }
    if (availableStock < item.quantity) {
      stockErrors.push(`${item.name} has only ${availableStock} unit(s) in stock (requested: ${item.quantity})`);
    }
  }
  if (stockErrors.length > 0) throw new Error(stockErrors.join(" | "));

  // 5. Build order items
  const orderItems = rawItems.map((item) => {
    const product = productMap[item.productId.toString()];
    let base, sku;
    if (product.hasVariants && item.variantId) {
      const variant = product.variants.find((v) => v._id.toString() === item.variantId.toString());
      base = variant.discountPrice ?? variant.price;
      sku = variant.sku || product.sku;
    } else {
      base = product.discountPrice ?? product.basePrice;
      sku = product.sku;
    }
    const vat = product.vatPercentage ? (base * product.vatPercentage) / 100 : 0;
    return {
      productId: item.productId,
      variantId: (product.hasVariants && item.variantId) ? item.variantId : null,
      name: item.name,
      sku,
      quantity: item.quantity,
      image: product.images?.[0]?.url || "",
      vatPercentage: product.vatPercentage ?? 0,
      shipping_category: product.shipping_category ?? "SP",
      priceAtPurchase: Number((base + vat).toFixed(2)),
    };
  });

  // 6. Calculate shipping
  let shippingPrice = 0;
  if (shippingMethod === "delivery") {
    if (shippingAddress.lat == null || shippingAddress.lng == null) {
      throw Object.assign(new Error("lat and lng are required for delivery orders"), { statusCode: 400 });
    }
    const { lat: STORE_LAT, lng: STORE_LNG } = getStoreCoords();
    const distanceKm = haversineDistance(STORE_LAT, STORE_LNG, shippingAddress.lat, shippingAddress.lng);
    validateDeliveryRange(shippingAddress.lat, shippingAddress.lng);
    shippingPrice = calcCartDeliveryFee(orderItems, distanceKm);
  }

  const { itemsPrice, taxPrice, totalPrice } = calcPrices(orderItems, shippingPrice);

  // Extract coupon data from Stripe PI metadata
  const couponMeta = intent.metadata?.couponCode
    ? {
        code: intent.metadata.couponCode || null,
        couponId: intent.metadata.couponId || null,
        discountAmount: parseFloat(intent.metadata.discountAmount || "0"),
        type: null,
        isFreeShipping: intent.metadata.isFreeShipping === "true",
      }
    : null;

  // Apply coupon discount to totalPrice
  const couponDiscount = couponMeta?.discountAmount || 0;
  const finalTotalPrice = parseFloat(Math.max(totalPrice - couponDiscount, 0).toFixed(2));

  // 7. Create order
  const order = await Order.create({
    ...(isGuest ? { isGuest: true, guestEmail: guestData.guestEmail } : { userId }),
    orderItems,
    shippingAddress,
    shippingMethod,
    paymentMethod: "Stripe",
    paymentStatus: "paid",
    orderStatus: "pending",
    paymentIntentId,
    paymentResult: { gatewayPaymentId: paymentIntentId, paidAt: new Date() },
    itemsPrice,
    shippingPrice,
    taxPrice,
    totalPrice: finalTotalPrice,
    coupon: couponMeta
      ? {
          code: couponMeta.code,
          couponId: couponMeta.couponId,
          discountAmount: couponMeta.discountAmount,
          isFreeShipping: couponMeta.isFreeShipping,
        }
      : { code: null, couponId: null, discountAmount: 0, isFreeShipping: false },
    statusHistory: [
      { status: "pending", note: "Order placed" },
    ],
  });

  // 8. Record coupon usage atomically (after order created)
  if (couponMeta?.couponId && couponMeta?.code) {
    try {
      await recordCouponUsageService({
        couponId:       couponMeta.couponId,
        couponCode:     couponMeta.code,
        userId:         isGuest ? null : userId,
        orderId:        order._id,
        guestEmail:     isGuest ? guestData.guestEmail : null,
        discountAmount: couponMeta.discountAmount,
      });
    } catch (couponErr) {
      console.error("Coupon usage recording failed:", couponErr.message);
    }
  }

  // 9. Deduct stock — variant or simple
  await Product.bulkWrite(
    rawItems.map((item) => {
      if (item.variantId) {
        return {
          updateOne: {
            filter: { _id: item.productId, "variants._id": item.variantId },
            update: { $inc: { "variants.$.stock": -item.quantity } },
          },
        };
      }
      return {
        updateOne: {
          filter: { _id: item.productId },
          update: { $inc: { stock: -item.quantity } },
        },
      };
    }),
  );

  // 10. Clear cart (only registered users)
  if (!isGuest) {
    await Cart.findOneAndUpdate({ userId }, { $set: { items: [], totalPrice: 0, totalSavings: 0 } });
  }

  // 10b. Auto-refill stock if any item reached 0
  await checkAndNotifyStockOut(order.orderItems);

  // 11. Send emails
  try {
    let emailTo, nameTo;
    if (isGuest) {
      emailTo = guestData.guestEmail;
      nameTo = shippingAddress.fullName;
    } else {
      const user = await User.findById(userId).select("email name").lean();
      emailTo = user?.email;
      nameTo = user?.name;
    }
    if (emailTo) {
      await Promise.all([
        sendOrderConfirmationToUser(emailTo, nameTo, order),
        sendNewOrderAlertToAdmin(emailTo, nameTo, order),
      ]);
    }
  } catch (emailErr) {
    console.error("Email sending failed:", emailErr.message);
  }

  return order;
};

// ─── 8. Check Delivery Availability ─────────────────────────────────────────

export const checkDeliveryAvailabilityService = (lat, lng) => {
  const { lat: STORE_LAT, lng: STORE_LNG } = getStoreCoords();
  const MAX_KM = parseFloat(process.env.MAX_DELIVERY_KM || "160");

  const distance = haversineDistance(STORE_LAT, STORE_LNG, lat, lng);
  const distanceKm = parseFloat(distance.toFixed(2));
  const available = distanceKm <= MAX_KM;

  return {
    available,
    distanceKm,
    message: available
      ? `Delivery available (${distanceKm} km from store)`
      : `Delivery not available. Your location is ${distanceKm} km away. We only deliver within ${MAX_KM} km.`,
  };
};


// ─── 9. Track Order (Public — by orderNumber) ────────────────────────────────

const DELIVERY_TIMELINE = ["pending", "confirmed", "processing", "shipped", "out_for_delivery", "delivered"];
const PICKUP_TIMELINE   = ["pending", "confirmed", "processing", "ready_for_pickup", "picked_up"];

const STATUS_LABELS = {
  pending:          "Order Placed",
  confirmed:        "Order Confirmed",
  processing:       "Processing",
  shipped:          "Shipped",
  out_for_delivery: "Out For Delivery",
  delivered:        "Delivered",
  ready_for_pickup: "Ready For Pickup",
  picked_up:        "Picked Up",
  cancelled:        "Cancelled",
};

const buildTimeline = (order) => {
  const steps = order.shippingMethod === "store_pickup" ? PICKUP_TIMELINE : DELIVERY_TIMELINE;
  const currentIdx = steps.indexOf(order.orderStatus);

  return steps.map((step, i) => {
    const historyEntry = order.statusHistory.find((h) => h.status === step);
    return {
      status: step,
      label: STATUS_LABELS[step],
      completed: order.orderStatus === "cancelled" ? false : i <= currentIdx,
      active: step === order.orderStatus,
      timestamp: historyEntry?.changedAt || null,
    };
  });
};

export const trackOrderService = async (orderNumber) => {
  const order = await Order.findOne({ orderNumber })
    .select(
      "orderNumber orderStatus shippingMethod shippingAddress statusHistory trackingDetails pickupDetails paymentMethod createdAt isGuest"
    )
    .lean();

  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });

  return {
    orderNumber: order.orderNumber,
    currentStatus: order.orderStatus,
    statusLabel: STATUS_LABELS[order.orderStatus],
    shippingMethod: order.shippingMethod,
    createdAt: order.createdAt,
    timeline: buildTimeline(order),
    trackingDetails: order.shippingMethod === "delivery" ? order.trackingDetails : null,
    pickupDetails: order.shippingMethod === "store_pickup" ? order.pickupDetails : null,
    deliveryAddress: order.shippingMethod === "delivery"
      ? {
          fullName: order.shippingAddress.fullName,
          city: order.shippingAddress.city,
          postalCode: order.shippingAddress.postalCode,
          country: order.shippingAddress.country,
        }
      : null,
  };
};

// ─── 10. Track Guest Order (by orderNumber + email) ───────────────────────────

export const trackGuestOrderService = async (orderNumber, email) => {
  const order = await Order.findOne({ orderNumber })
    .select(
      "orderNumber orderStatus shippingMethod shippingAddress statusHistory trackingDetails pickupDetails paymentMethod createdAt isGuest guestEmail userId"
    )
    .populate("userId", "email")
    .lean();

  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });

  // Match email — guest order or registered user's email
  const orderEmail = order.isGuest
    ? order.guestEmail
    : order.userId?.email;

  if (!orderEmail || orderEmail.toLowerCase() !== email.toLowerCase()) {
    throw Object.assign(new Error("No order found with this order number and email"), { statusCode: 404 });
  }

  return {
    orderNumber: order.orderNumber,
    currentStatus: order.orderStatus,
    statusLabel: STATUS_LABELS[order.orderStatus],
    shippingMethod: order.shippingMethod,
    createdAt: order.createdAt,
    timeline: buildTimeline(order),
    trackingDetails: order.shippingMethod === "delivery" ? order.trackingDetails : null,
    pickupDetails: order.shippingMethod === "store_pickup" ? order.pickupDetails : null,
    deliveryAddress: order.shippingMethod === "delivery"
      ? {
          fullName: order.shippingAddress.fullName,
          city: order.shippingAddress.city,
          postalCode: order.shippingAddress.postalCode,
          country: order.shippingAddress.country,
        }
      : null,
  };
};

// ─── Get Cancellation Requests (Admin) ──────────────────────────────────────

export const getCancellationRequestsService = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const query = { cancellationStatus: "pending" };

  const [orders, total] = await Promise.all([
    Order.find(query)
      .populate("userId", "name email")
      .select("orderNumber userId orderStatus paymentStatus totalPrice cancellationReason cancellationRequestedAt createdAt orderItems")
      .sort("-cancellationRequestedAt")
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Order.countDocuments(query),
  ]);

  return {
    orders,
    totalOrders: total,
    totalPages: Math.ceil(total / limit),
    currentPage: parseInt(page),
  };
};

// ─── Approve Cancellation Request (Admin) ────────────────────────────────────

export const approveCancellationService = async (orderId, adminId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId))
    throw Object.assign(new Error("Invalid order ID"), { statusCode: 400 });

  const order = await Order.findById(orderId);
  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });

  if (order.cancellationStatus !== "pending")
    throw Object.assign(new Error("No pending cancellation request for this order"), { statusCode: 400 });

  // Restore stock
  await Product.bulkWrite(
    order.orderItems.map((item) =>
      item.variantId
        ? { updateOne: { filter: { _id: item.productId, "variants._id": item.variantId }, update: { $inc: { "variants.$.stock": item.quantity } } } }
        : { updateOne: { filter: { _id: item.productId }, update: { $inc: { stock: item.quantity } } } }
    )
  );

  // Stripe refund if paid
  let stripeRefundId = null;
  if (order.paymentStatus === "paid" && order.paymentIntentId) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: order.paymentIntentId,
        reason: "requested_by_customer",
      });
      stripeRefundId = refund.id;
      order.paymentStatus = "refunded";
      order.paymentResult = { ...order.paymentResult?.toObject?.() ?? {}, refundId: refund.id, refundedAt: new Date() };
    } catch (stripeErr) {
      throw Object.assign(new Error(`Stripe refund failed: ${stripeErr.message}`), { statusCode: 502 });
    }
  }

  const now = new Date();
  order.orderStatus = "cancelled";
  order.cancellationStatus = "approved";
  order.cancelledAt = now;
  order.cancelledBy = adminId;
  order.cancellationReviewedAt = now;
  order.statusHistory.push({ status: "cancelled", changedBy: adminId, note: "Cancellation approved by admin", changedAt: now });

  await order.save();

  try {
    let emailTo, nameTo;
    if (order.isGuest) {
      emailTo = order.guestEmail;
      nameTo = order.shippingAddress?.fullName || "Customer";
    } else {
      const user = await User.findById(order.userId).select("email name").lean();
      emailTo = user?.email;
      nameTo = user?.name || "Customer";
    }
    if (emailTo) {
      await Promise.all([
        sendCancellationEmailToCustomer(emailTo, nameTo, order, order.totalPrice),
        sendCancellationAlertToAdmin(order, stripeRefundId, "Admin"),
      ]);
    }
  } catch (e) { console.error("Email error:", e.message); }

  return { order, refundId: stripeRefundId };
};

// ─── Reject Cancellation Request (Admin) ─────────────────────────────────────

export const rejectCancellationService = async (orderId, adminId, rejectionReason = "") => {
  if (!mongoose.Types.ObjectId.isValid(orderId))
    throw Object.assign(new Error("Invalid order ID"), { statusCode: 400 });

  const order = await Order.findById(orderId);
  if (!order) throw Object.assign(new Error("Order not found"), { statusCode: 404 });

  if (order.cancellationStatus !== "pending")
    throw Object.assign(new Error("No pending cancellation request for this order"), { statusCode: 400 });

  const now = new Date();
  order.cancellationStatus = "rejected";
  order.cancellationReviewedAt = now;
  order.cancellationRejectionReason = rejectionReason || "Request rejected by admin";
  order.statusHistory.push({ status: order.orderStatus, changedBy: adminId, note: `Cancellation rejected. Reason: ${rejectionReason || "No reason given"}`, changedAt: now });

  await order.save();
  return order;
};

export const deleteOrderService = async (id) => {
  const order = await Order.findByIdAndDelete(id);

  if (!order) {
    throw new Error("Order not found");
  }

  return order;
};