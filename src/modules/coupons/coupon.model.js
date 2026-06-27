import mongoose from "mongoose";

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Coupon code is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    type: {
      type: String,
      enum: ["percentage", "flat", "free_shipping", "first_order", "product_specific", "category_specific", "user_specific"],
      required: true,
    },
    // Discount value — percentage ke liye 0-100, flat ke liye £ amount
    // free_shipping ke liye value ignored
    value: {
      type: Number,
      default: 0,
      min: [0, "Value cannot be negative"],
    },
    // Percentage type mein max cap — e.g., 20% off but max £15
    maxDiscount: {
      type: Number,
      default: null,
    },
    // Minimum cart total (ex-VAT, before coupon) required to apply
    minOrderAmount: {
      type: Number,
      default: 0,
    },

    // ── Targeting ──────────────────────────────────────────────────────────────
    applicableProducts: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
    ],
    applicableCategories: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    ],
    // user_specific type ke liye — sirf yeh users use kar sakte hain
    allowedUsers: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    ],

    // ── Validity ───────────────────────────────────────────────────────────────
    startDate: {
      type: Date,
      default: Date.now,
    },
    expiryDate: {
      type: Date,
      required: [true, "Expiry date is required"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // ── Usage Limits ───────────────────────────────────────────────────────────
    // null = unlimited global uses
    usageLimit: {
      type: Number,
      default: null,
    },
    // Atomic counter — $inc se update hoga, kabhi direct save() nahi
    usageCount: {
      type: Number,
      default: 0,
    },
    // Per user max uses — default 1 (ek baar use)
    perUserLimit: {
      type: Number,
      default: 1,
    },

    // ── Analytics ──────────────────────────────────────────────────────────────
    // Total £ discount diya gaya — atomic $inc se update
    totalDiscountGiven: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Indexes for fast lookups
couponSchema.index({ code: 1 }, { unique: true });
couponSchema.index({ isActive: 1, expiryDate: 1 });

export const Coupon = mongoose.model("Coupon", couponSchema);
