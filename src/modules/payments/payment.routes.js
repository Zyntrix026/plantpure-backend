import express from "express";
import {
  createPaymentSession,
  createPaymentIntentFromCart,
  createPaymentIntent,
  cashfreeWebhook,
  getPaymentStatus,
} from "./payment.controller.js";
import { authenticatedUser, optionalAuth, anyAuthenticated } from "../../middleware/role.middleware.js";

const router = express.Router();

router.post("/create-session", optionalAuth, createPaymentSession);           // registered checkout
router.post("/create-intent-from-cart", optionalAuth, createPaymentIntentFromCart); // guest checkout
router.post("/create-intent", authenticatedUser, createPaymentIntent);
router.get("/status/:orderId", anyAuthenticated, getPaymentStatus);
router.post("/webhook", cashfreeWebhook);

export default router;
