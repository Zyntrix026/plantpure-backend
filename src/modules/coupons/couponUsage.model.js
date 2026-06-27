import mongoose from "mongoose";

const couponUsageSchema = new mongoose.Schema(
  {
    couponId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
    },
    // null for guest users
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    // Guest tracking
    guestEmail: {
      type: String,
      default: null,
    },
    discountAmount: {
      type: Number,
      required: true,
    },
    couponCode: {
      type: String,
      required: true,
      uppercase: true,
    },
  },
  { timestamps: true }
);

// Fast lookup: ek user ne yeh coupon kitni baar use kiya
couponUsageSchema.index({ couponId: 1, userId: 1 });
couponUsageSchema.index({ orderId: 1 }, { unique: true });

export const CouponUsage = mongoose.model("CouponUsage", couponUsageSchema);
