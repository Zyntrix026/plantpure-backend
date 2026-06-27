import express from "express";
import {
  createPaymentIntentFromCart,
  createPaymentIntent,
  stripeWebhook,
  getPaymentStatus,
} from "./payment.controller.js";
import { authenticatedUser, anyAuthenticated, optionalAuth } from "../../middleware/role.middleware.js";

const router = express.Router();

router.post("/create-intent-from-cart", optionalAuth, createPaymentIntentFromCart);
router.post("/create-intent", authenticatedUser, createPaymentIntent);
router.get("/status/:orderId", anyAuthenticated, getPaymentStatus);
router.post("/webhook", stripeWebhook);

export default router;
