import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot be more than 5"],
    },
    comment: {
      type: String,
      required: [true, "Review comment is required"],
      trim: true,
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },
    image: {
      type: String,
      default: null, 
      trim: true,
    },
    isVerifiedBuyer: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Search optimization index
reviewSchema.index({ name: "text", comment: "text" });

const GoogleReview = mongoose.model("GoogleReview", reviewSchema);

export default GoogleReview;