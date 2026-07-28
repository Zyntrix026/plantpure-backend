import { validationResult } from "express-validator";
import Review from "./googleReview.model.js";

// @desc    Get all reviews (Search, Filter, Pagination & Stats)
// @route   GET /api/reviews
// @access  Public / Admin
export const getReviews = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const { search, rating } = req.query;

    let query = {};

    // Rating Filter
    if (rating && rating !== "all") {
      query.rating = Number(rating);
    }

    // Live Search Filter (Matches Name or Comment)
    if (search && search.trim() !== "") {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { comment: { $regex: search, $options: "i" } },
      ];
    }

    // Execute Queries
    const totalReviews = await Review.countDocuments(query);
    const reviews = await Review.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Calculate Summary Stats
    const stats = await Review.aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: "$rating" },
          totalCount: { $sum: 1 },
        },
      },
    ]);

    const averageRating = stats.length > 0 ? stats[0].avgRating.toFixed(1) : 0;

    return res.status(200).json({
      success: true,
      count: reviews.length,
      totalReviews,
      totalPages: Math.ceil(totalReviews / limit),
      currentPage: page,
      averageRating: Number(averageRating),
      data: reviews,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error: Unable to fetch reviews",
      error: error.message,
    });
  }
};

// @desc    Create a new review
// @route   POST /api/reviews
// @access  Admin / User
export const createReview = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    const { name, rating, comment, image } = req.body;

    const newReview = await Review.create({
      name,
      rating,
      comment,
      image: image && image.trim() !== "" ? image : null,
    });

    return res.status(201).json({
      success: true,
      message: "Review created successfully",
      data: newReview,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error: Unable to create review",
      error: error.message,
    });
  }
};

// @desc    Update existing review
// @route   PUT /api/reviews/:id
// @access  Admin
export const updateReview = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array(),
    });
  }

  try {
    const { name, rating, comment, image } = req.body;

    let review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    review = await Review.findByIdAndUpdate(
      req.params.id,
      {
        name,
        rating,
        comment,
        image: image && image.trim() !== "" ? image : null,
      },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Review updated successfully",
      data: review,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error: Unable to update review",
      error: error.message,
    });
  }
};

// @desc    Delete review
// @route   DELETE /api/reviews/:id
// @access  Admin
export const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    await review.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server Error: Unable to delete review",
      error: error.message,
    });
  }
};