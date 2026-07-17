import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
      default: null,
      index: true,
    },
    isGuest: {
      type: Boolean,
      default: false,
    },
    guestEmail: {
      type: String,
      default: null,
    },
    orderItems: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
        name: { type: String, required: true },
        sku: { type: String },
        quantity: { type: Number, required: true, min: 1 },
        image: { type: String },
        vatPercentage: { type: Number, default: 0 },
        shipping_category: { type: String, enum: ["SP", "BB"], default: "SP" },
        priceAtPurchase: { type: Number, required: true },
      },
    ],
    shippingMethod: {
      type: String,
      enum: ["delivery", "store_pickup"],
      default: "delivery",
    },
    shippingAddress: {
      fullName: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String },
      city: { type: String },
      postalCode: { type: String },
      country: { type: String, default: "United Kingdom" },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    // --- PAYMENT ---
    paymentMethod: {
      type: String,
      enum: ["Stripe", "Razorpay", "PayPal", "Cashfree", "COD"],
      required: true,
      default: "COD",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentResult: {
      // Populated by payment gateway webhook/callback
      gatewayOrderId: String,
      gatewayPaymentId: String,
      gatewaySignature: String,
      paidAt: Date,
    },
    paymentIntentId: {
      type: String,
      index: true,
    },
    cfOrderId: {
      type: String,
      index: true,
      default: null,
    },
    // --- ORDER STATUS ---
    orderStatus: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        // Delivery-only
        "shipped",
        "out_for_delivery",
        "delivered",
        // Store Pickup-only
        "ready_for_pickup",
        "picked_up",
        // Final
        "cancelled",
      ],
      default: "pending",
      index: true,
    },
    statusHistory: [
      {
        status: { type: String },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        note: { type: String },
        changedAt: { type: Date, default: Date.now },
      },
    ],
    // --- TRACKING (Delivery only) ---
    trackingDetails: {
      trackingNumber: { type: String, default: null },
      courierName: { type: String, default: null },
      trackingUrl: { type: String, default: null },
      estimatedDeliveryDate: { type: Date, default: null },
      shippedAt: { type: Date, default: null },
      outForDeliveryAt: { type: Date, default: null },
      deliveredAt: { type: Date, default: null },
    },
    // --- PICKUP (Store Pickup only) ---
    pickupDetails: {
      pickupCode: { type: String, default: null },
      pickedUpAt: { type: Date, default: null },
      pickedUpBy: { type: String, default: null },
    },
    // --- PRICING ---
    itemsPrice: { type: Number, required: true, default: 0 },
    shippingPrice: { type: Number, required: true, default: 0 },
    taxPrice: { type: Number, required: true, default: 0 },
    totalPrice: { type: Number, required: true, default: 0 },
    // --- COUPON ---
    coupon: {
      code: { type: String, default: null },
      couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", default: null },
      discountAmount: { type: Number, default: 0 },
      type: { type: String, default: null },
      isFreeShipping: { type: Boolean, default: false },
    },

    // --- CANCELLATION ---
    cancelledAt: { type: Date },
    cancellationReason: { type: String },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    cancellationStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
    cancellationRequestedAt: { type: Date, default: null },
    cancellationReviewedAt: { type: Date, default: null },
    cancellationRejectionReason: { type: String, default: null },
  },
  { timestamps: true }
);

// Auto-generate sequential orderNumber: ORD-YYMM001
orderSchema.pre("save", async function () {
  if (!this.orderNumber) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2); // e.g. "26"
    const mm = String(now.getMonth() + 1).padStart(2, "0"); // e.g. "05"
    const prefix = `ORD-${yy}${mm}`; // e.g. "ORD-2605"

    // Find the last order of this month
    const last = await Order.findOne(
      { orderNumber: { $regex: `^${prefix}` } },
      { orderNumber: 1 },
      { sort: { orderNumber: -1 } }
    ).lean();

    let nextSeq = 1;
    if (last) {
      // Extract last 3 digits sequence from e.g. "ORD-2605007" -> 7
      const lastSeq = parseInt(last.orderNumber.replace(prefix, ""), 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }

    this.orderNumber = `${prefix}${String(nextSeq).padStart(3, "0")}`;
  }
});

export const Order = mongoose.model("Order", orderSchema);
