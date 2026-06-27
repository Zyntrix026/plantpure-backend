import mongoose from "mongoose";

const heroBannerSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true },
    subtitle: { type: String },
    bannerImage: { type: String, required: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    priority: { type: Number, default: 0 },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  },
  { timestamps: true },
);

export const HeroBanner = mongoose.model("HeroBanner", heroBannerSchema);
