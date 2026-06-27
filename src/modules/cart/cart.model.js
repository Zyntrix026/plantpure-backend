import mongoose from "mongoose";

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        // null for simple products, ObjectId for variant products
        variantId: {
          type: mongoose.Schema.Types.ObjectId,
          default: null,
        },
        // Human-readable label e.g. "XL", "Red", "1kg" — for display
        variantLabel: {
          type: String,
          default: null,
        },
        name: String,
        image: String,
        basePrice: Number,
        discountPrice: Number,
        discountPercentage: String,
        shipping_category: { type: String, enum: ["SP", "BB"], default: "SP" },
        vatPercentage: { type: Number, default: 0 },
        quantity: {
          type: Number,
          required: true,
          min: [1, "Quantity cannot be less than 1."],
          default: 1,
        },
      },
    ],
    totalPrice: { type: Number, default: 0 },
    totalSavings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Cart = mongoose.model("Cart", cartSchema);
