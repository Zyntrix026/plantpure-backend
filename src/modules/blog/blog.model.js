import mongoose from "mongoose";

const blogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    excerpt: {
      type: String,
      maxLength: [350, "Excerpt cannot exceed 350 characters"],
    },
    image: {
      url: {
        type: String,
        required: [true, "Feature image is required"],
      },
      alt: {
        type: String,
        default: "TefeTimes blog image",
      },
      fileId: {
        type: String,
      },
    },
    content: {
      type: String,
      required: [true, "Content is required"],
    },

    // --- Dynamic Relationships ---
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],

    // Targetting User Model for Author Info
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // --- Stats & Metadata ---
    tags: [
      {
        type: String,
        lowercase: true,
        trim: true,
      },
    ],
    readTime: {
      type: Number,
      default: 4,
    },
    views: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    publishedAt: {
      type: Date,
    },

    // --- SEO Optimization ---
    seo: {
      metaTitle: {
        type: String,
        trim: true,
      },
      metaDescription: {
        type: String,
        trim: true,
      },
      keywords: [String],
      canonicalUrl: String,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  },
);

// Indexing for faster search (Optional but recommended)
blogSchema.index({ title: "text", tags: "text" });

export default mongoose.models.Blog || mongoose.model("Blog", blogSchema);
