import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Product title is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    excerpt: { type: String, trim: true },
    sku: {
      type: String,
      required: [true, "SKU is mandatory"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    productOverview: {
      type: String,
      required: [true, "Full description is required"],
    },
    // Only used when hasVariants: false
    basePrice: {
      type: Number,
      min: [0, "Price cannot be negative"],
      default: null,
    },
    discountPrice: { type: Number, default: null },
    vatPercentage: { type: Number, enum: [0, 5, 20], default: 0 },
    discountPercentage: { type: String },

    // --- VARIANTS SYSTEM ---
    hasVariants: { type: Boolean, default: false },
    variants: {
      type: [
        {
          label: { type: String, required: true, trim: true }, // Dynamic — "S", "Red", "1kg", kuch bhi
          price: { type: Number, required: true, min: [0, "Variant price cannot be negative"] },
          discountPrice: { type: Number, default: null },
          stock: { type: Number, default: 0 },
          sku: { type: String, trim: true, default: null },
        },
      ],
      default: [],
    },

    category: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
      required: [true, "Please assign at least one category"],
    },
    status: { type: String, enum: ["Active", "Draft"], default: "Active" },
    images: {
      type: [
        {
          url: { type: String, required: true },
          fileId: String,
          alt: String,
          size: Number,
        },
      ],
      validate: [(val) => val.length <= 5, "Maximum 5 images allowed"],
      default: [],
    },
    metaTitle: { type: String, trim: true },
    metaDescription: { type: String, trim: true },
    keywords: { type: [String], default: [] },
    brand: { type: String, trim: true, default: "Generic" },
    stock: { type: Number, default: 0 }, // Only used when hasVariants: false
    isFeatured: { type: Boolean, default: false },
    ratings: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
    shipping_category: {
      type: String,
      enum: ["SP", "BB"],
      default: "SP",
      required: false,
    },
  },
  { timestamps: true },
);

productSchema.index({ title: "text", keywords: "text" });
productSchema.index({ category: 1 });
productSchema.index({ basePrice: 1 });

export const Product = mongoose.model("Product", productSchema);
