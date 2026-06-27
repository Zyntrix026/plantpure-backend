import express from "express";
import rateLimit from "express-rate-limit";
import {
  validateCoupon,
  createCoupon,
  getAllCoupons,
  getCouponById,
  updateCoupon,
  toggleCouponStatus,
  deleteCoupon,
  getCouponUsage,
  getCouponAnalytics,
} from "./coupon.controller.js";
import { adminOnly, optionalAuth } from "../../middleware/role.middleware.js";

const router = express.Router();

// Rate limiter — brute force protection on validate endpoint
// 15 attempts per IP per minute
const couponRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { success: false, message: "Too many coupon attempts. Please try again in a minute." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── User-facing ──────────────────────────────────────────────────────────────
// optionalAuth: registered user ya guest dono use kar sakte hain
router.post("/validate", couponRateLimiter, optionalAuth, validateCoupon);

// ─── Admin ────────────────────────────────────────────────────────────────────
router.get("/admin/analytics", adminOnly, getCouponAnalytics);
router.get("/admin/all", adminOnly, getAllCoupons);
router.post("/admin/create", adminOnly, createCoupon);
router.get("/admin/:id/usage", adminOnly, getCouponUsage);
router.get("/admin/:id", adminOnly, getCouponById);
router.patch("/admin/:id/toggle", adminOnly, toggleCouponStatus);
router.patch("/admin/:id", adminOnly, updateCoupon);
router.delete("/admin/:id", adminOnly, deleteCoupon);

export default router;
