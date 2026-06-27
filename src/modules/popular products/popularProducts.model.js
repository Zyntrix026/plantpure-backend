import mongoose from "mongoose";

const popularProductsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Section title is required"],
      default: "Popular Products",
      trim: true,
    },

    products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: [true, "Please select at least one product"],
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

export const PopularProducts = mongoose.model(
  "PopularProducts",
  popularProductsSchema,
);
