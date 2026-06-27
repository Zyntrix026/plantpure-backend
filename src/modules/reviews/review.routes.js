import express from "express";
import {
  addReview,
  getProductReviews,
  updateReview,
  deleteReview,
  getMyReview,
  getAllReviewsAdmin,
  toggleReviewStatus,
  deleteReviewByAdmin,
  getReviewStats,
} from "./review.controller.js";
import { authenticatedUser, adminOnly } from "../../middleware/role.middleware.js";

const router = express.Router();

// ─── Public ───────────────────────────────────────────────────────────────────
router.get("/product/:productId", getProductReviews);

// ─── Customer ─────────────────────────────────────────────────────────────────
router.post("/add", authenticatedUser, addReview);
router.put("/update/:reviewId", authenticatedUser, updateReview);
router.delete("/delete/:reviewId", authenticatedUser, deleteReview);
router.get("/my", authenticatedUser, getMyReview);

// ─── Admin ────────────────────────────────────────────────────────────────────
router.get("/admin/all", adminOnly, getAllReviewsAdmin);
router.get("/admin/stats", adminOnly, getReviewStats);
router.patch("/admin/toggle/:reviewId", adminOnly, toggleReviewStatus);
router.delete("/admin/delete/:reviewId", adminOnly, deleteReviewByAdmin);

export default router;
