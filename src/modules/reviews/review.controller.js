import mongoose from "mongoose";
import { Review } from "./review.model.js";
import { Product } from "../products/product.model.js";
import { Order } from "../orders/order.model.js";

// ─── Helper: Recalculate product rating from ACTIVE reviews only ──────────────
const recalcRatings = async (productId) => {
  const stats = await Review.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId), isActive: true } },
    { $group: { _id: "$productId", avgRating: { $avg: "$rating" }, totalReviews: { $sum: 1 } } },
  ]);
  await Product.findByIdAndUpdate(productId, {
    "ratings.average": stats.length > 0 ? parseFloat(stats[0].avgRating.toFixed(1)) : 0,
    "ratings.count": stats.length > 0 ? stats[0].totalReviews : 0,
  });
};

// ─── 1. ADD REVIEW (Customer — only if product delivered) ────────────────────
export const addReview = async (req, res) => {
  const { productId, rating, comment } = req.body;
  const userId = req.user.userId;
  try {
    if (!productId || !rating || !comment) {
      return res.status(400).json({ success: false, message: "productId, rating and comment are required" });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    // Check: user ne yeh product buy kiya hai aur order delivered hai
    const purchasedOrder = await Order.findOne({
      userId,
      orderStatus: "confirmed",
      "orderItems.productId": new mongoose.Types.ObjectId(productId),
    });

    if (!purchasedOrder) {
      return res.status(403).json({
        success: false,
        message: "You can only review products you have purchased and received",
      });
    }

    const existing = await Review.findOne({ productId, userId });
    if (existing) return res.status(400).json({ success: false, message: "You have already reviewed this product" });

    await Review.create({ productId, userId, rating, comment, isActive: true });
    await recalcRatings(productId);

    res.status(201).json({ success: true, message: "Review added successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 2. GET REVIEWS FOR A PRODUCT (Public — only active) ─────────────────────
export const getProductReviews = async (req, res) => {
  const { productId } = req.params;
  try {
    const reviews = await Review.find({ productId, isActive: true })
      .populate("userId", "name avatar")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: reviews.length, reviews });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 3. UPDATE REVIEW (Customer — own review only) ───────────────────────────
export const updateReview = async (req, res) => {
  const { reviewId } = req.params;
  const { rating, comment } = req.body;
  const userId = req.user.userId;
  try {
    if (!rating && !comment) {
      return res.status(400).json({ success: false, message: "rating or comment is required to update" });
    }
    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });
    if (review.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: "You can only update your own review" });
    }

    if (rating) review.rating = rating;
    if (comment) review.comment = comment;
    await review.save();
    await recalcRatings(review.productId);

    res.status(200).json({ success: true, message: "Review updated successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 4. DELETE REVIEW (Customer — own review only) ───────────────────────────
export const deleteReview = async (req, res) => {
  const { reviewId } = req.params;
  const userId = req.user.userId;
  try {
    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });
    if (review.userId.toString() !== userId) {
      return res.status(403).json({ success: false, message: "You can only delete your own review" });
    }

    const productId = review.productId;
    await Review.findByIdAndDelete(reviewId);
    await recalcRatings(productId);

    res.status(200).json({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 5. GET ALL MY REVIEWS (Customer) ───────────────────────────────────────
export const getMyReview = async (req, res) => {
  const userId = req.user.userId;
  try {
    const reviews = await Review.find({ userId })
      .populate("productId", "title slug images")
      .sort({ createdAt: -1 })
      .lean();

    const data = reviews.map((r) => ({
      _id: r._id,
      rating: r.rating,
      comment: r.comment,
      isActive: r.isActive,
      createdAt: r.createdAt,
      product: {
        _id: r.productId?._id,
        title: r.productId?.title,
        slug: r.productId?.slug,
        thumbnail: r.productId?.images?.[0]?.url || null,
      },
    }));

    res.status(200).json({ success: true, count: data.length, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 6. GET ALL REVIEWS — Admin (all with isActive status) ───────────────────
export const getAllReviewsAdmin = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    const query = {};

    if (status === "true") query.isActive = true;
    else if (status === "false") query.isActive = false;

    if (search) {
      const s = search.trim();
      query.$or = [
        { comment: { $regex: s, $options: "i" } },
      ];
      // Product title se search ke liye matching productIds nikaalein
      const matchedProducts = await Product.find(
        { title: { $regex: s, $options: "i" } },
        { _id: 1 }
      ).lean();
      if (matchedProducts.length > 0) {
        const productIds = matchedProducts.map((p) => p._id);
        query.$or.push({ productId: { $in: productIds } });
      }
    }

    const skip = (page - 1) * limit;
    const [reviews, total] = await Promise.all([
      Review.find(query)
        .populate("productId", "title")
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Review.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      reviews,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 7. TOGGLE ACTIVE/DEACTIVE — Admin ───────────────────────────────────────
export const toggleReviewStatus = async (req, res) => {
  const { reviewId } = req.params;
  try {
    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });

    review.isActive = !review.isActive;
    await review.save();
    await recalcRatings(review.productId);

    res.status(200).json({
      success: true,
      message: `Review ${review.isActive ? "activated" : "deactivated"} successfully`,
      isActive: review.isActive,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 8. DELETE REVIEW — Admin (force delete) ─────────────────────────────────
export const deleteReviewByAdmin = async (req, res) => {
  const { reviewId } = req.params;
  try {
    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });

    const productId = review.productId;
    await Review.findByIdAndDelete(reviewId);
    await recalcRatings(productId);

    res.status(200).json({ success: true, message: "Review deleted by admin successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 9. GET REVIEW STATS — Admin ─────────────────────────────────────────────
export const getReviewStats = async (req, res) => {
  try {
    // 1. Counts aur Average Rating ko parallel execute karein pipeline se
    const [counts, avgData] = await Promise.all([
      Promise.all([
        Review.countDocuments(),
        Review.countDocuments({ isActive: true }),
        Review.countDocuments({ isActive: false }),
      ]),
      Review.aggregate([
        {
          $group: {
            _id: null,
            averageRating: { $avg: "$rating" }
          }
        }
      ])
    ]);

    const [total, active, inactive] = counts;
    
    // Average rating ko 1 decimal point tak fix karein (e.g., 4.3), default 0.0
    const averageRating = avgData.length > 0 ? avgData[0].averageRating.toFixed(1) : "0.0";

    // 2. Rating Distribution (1★ se 5★ tak kitne hain)
    const ratingDist = await Review.aggregate([
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: { 
        total, 
        active, 
        pending: inactive, // Dashboard component 'pending' key expect karta hai
        averageRating, 
        ratingDistribution: ratingDist 
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};