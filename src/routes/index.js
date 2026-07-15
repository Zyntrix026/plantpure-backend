import express from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import vendorRoutes from "../modules/vendors/vendor.routes.js";
import categoriesRoutes from "../modules/categories/category.routes.js";
import productsRoutes from "../modules/products/product.routes.js";
import cartRoutes from "../modules/cart/cart.routes.js";
import orderRoutes from "../modules/orders/order.routes.js";
import heroBannerRoutes from "../modules/heroBanner/heroBanner.routes.js";
import dealsOfDayRoutes from "../modules/deals of day/deals.routes.js";
import popularProductsRoutes from "../modules/popular products/popularProducts.routes.js";
import imageUploadRoutes from "../modules/imageUpload/imageUploadRoutes.js";
import reviewRoutes from "../modules/reviews/review.routes.js";
import paymentRoutes from "../modules/payments/payment.routes.js";
import userRoutes from "../modules/users/user.routes.js";
import wishlistRoutes from "../modules/wishlist/wishlist.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import couponRoutes from "../modules/coupons/coupon.routes.js";
import legalRoutes from "../modules/legal page/legalRoutes.js";
import campaignRoutes from "../modules/campaign/campaign.routes.js";
import blogRoutes from "../modules/blog/blog.routes.js";
import contactRoutes from "../modules/contact/contact.routes.js";

const router = express.Router();

// Auth routes
router.use("/auth", authRoutes);

// Vendor management routes (admin)
router.use("/vendors", vendorRoutes);

// Categories Management
router.use("/categories", categoriesRoutes);

// Products Management
router.use("/products", productsRoutes);

// Cart Management
router.use("/cart", cartRoutes);

// Order Management
router.use("/orders", orderRoutes);

// Review Management
router.use("/reviews", reviewRoutes);

// Image Upload Routes
router.use("/image", imageUploadRoutes);

// Hero Banner
router.use("/banner", heroBannerRoutes);

// Deals of Day
router.use("/deals", dealsOfDayRoutes);

// Popular Products
router.use("/popular", popularProductsRoutes);

// Wishlist Routes
router.use("/wishlist", wishlistRoutes);

// User Profile Routes
router.use("/users", userRoutes);

// Payment Routes
router.use("/payments", paymentRoutes);

// Dashboard Stats (Admin)
router.use("/dashboard", dashboardRoutes);

// Coupon Management
router.use("/coupons", couponRoutes);

// Legal Pages
router.use("/legal", legalRoutes);

// Campaign Management
router.use("/campaigns", campaignRoutes);

// Blog Management
router.use("/blogs",blogRoutes);

// Inquiry Management
router.use("/inquiries", contactRoutes);

// Health check
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "API is running",
    timestamp: new Date().toISOString(),
  });
});

export default router;
