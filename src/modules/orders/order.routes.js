import express from "express";
import {
  createOrder,
  createOrderAfterPayment,
  getMyOrders,
  getOrderById,
  getOrderByCfOrderId,
  getAllOrders,
  updateOrderStatus,
  cancelOrder,
  getOrderStats,
  checkDelivery,
  deleteOrder,
  trackOrder,
  trackGuestOrder,
  requestOrderCancellation,
  getCancellationRequests,
  approveCancellation,
  rejectCancellation,
  createManualOrder,
  createAdminShipment,
  getShippingLabel,
  trackAdminShipment,
  cancelAdminShipment,
} from "./order.controller.js";
import {
  authenticatedUser,
  adminOnly,
  anyAuthenticated,
  optionalAuth,
} from "../../middleware/role.middleware.js";

const router = express.Router();

// ─── Public ───────────────────────────────────────────────────────────────────
router.get("/check-delivery", checkDelivery);
router.get("/track/:orderNumber", trackOrder);
router.post("/track-guest", trackGuestOrder);

// ─── Guest + Registered ───────────────────────────────────────────────────────
router.post("/create-after-payment", optionalAuth, createOrderAfterPayment);
router.get("/by-cf/:cfOrderId", optionalAuth, getOrderByCfOrderId);

// ─── Customer Routes ──────────────────────────────────────────────────────────
router.post("/create", authenticatedUser, createOrder);
router.get("/my-orders", authenticatedUser, getMyOrders);
router.post("/request-cancellation/:id", authenticatedUser, requestOrderCancellation);      // customer request cancellation

// ─── Admin Routes ─────────────────────────────────────────────────────────────
router.post("/admin/manual", adminOnly, createManualOrder);
router.get("/admin/all", adminOnly, getAllOrders);
router.get("/admin/stats", adminOnly, getOrderStats);
router.get("/admin/cancellation-requests", adminOnly, getCancellationRequests);
router.patch("/admin/cancellation-requests/:id/approve", adminOnly, approveCancellation);
router.patch("/admin/cancellation-requests/:id/reject", adminOnly, rejectCancellation);
router.patch("/admin/status/:id", adminOnly, updateOrderStatus);
router.post("/admin/cancel/:id", adminOnly, cancelOrder);
router.delete("/admin/:id", adminOnly, deleteOrder);

// ─── Admin Shipment Management ────────────────────────────────────────────────
router.post("/admin/:id/create-shipment", adminOnly, createAdminShipment);
router.get("/admin/:id/shipping-label", adminOnly, getShippingLabel);
router.get("/admin/:id/track-shipment", adminOnly, trackAdminShipment);
router.post("/admin/:id/cancel-shipment", adminOnly, cancelAdminShipment);

// ─── Shared (Customer sees own, Admin sees any) ───────────────────────────────
router.get("/:id", anyAuthenticated, getOrderById);

export default router;
