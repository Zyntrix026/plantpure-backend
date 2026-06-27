import {
  createOrderService,
  createOrderAfterPaymentService,
  getMyOrdersService,
  getOrderByIdService,
  getAllOrdersService,
  updateOrderStatusService,
  cancelOrderService,
  getOrderStatsService,
  checkDeliveryAvailabilityService,
  deleteOrderService,
  trackOrderService,
  trackGuestOrderService,
  requestCancellationService,
  getCancellationRequestsService,
  approveCancellationService,
  rejectCancellationService,
} from "./order.service.js";

const ALLOWED_STATUSES = [
  "pending", "confirmed", "processing",
  "shipped", "out_for_delivery", "delivered",
  "ready_for_pickup", "picked_up",
  "cancelled",
];
const ALLOWED_PAYMENT_METHODS = ["COD", "Stripe", "Razorpay", "PayPal"];

// ─── POST /orders/create ─────────────────────────────────────────────────────
export const createOrder = async (req, res) => {
  try {
    const { shippingAddress, paymentMethod, shippingMethod = "delivery" } = req.body;
    const userId = req.user.userId;

    if (!shippingAddress || !paymentMethod)
      return res.status(400).json({ success: false, message: "shippingAddress and paymentMethod are required" });

    const { fullName, phone, address, city, postalCode, country } = shippingAddress;
    if (!fullName || !phone)
      return res.status(400).json({ success: false, message: "shippingAddress must include: fullName, phone" });

    if (shippingMethod === "delivery" && (!address || !city || !postalCode || !country))
      return res.status(400).json({ success: false, message: "shippingAddress must include: address, city, postalCode, country for delivery orders" });

    if (!ALLOWED_PAYMENT_METHODS.includes(paymentMethod))
      return res.status(400).json({ success: false, message: `Invalid paymentMethod. Allowed: ${ALLOWED_PAYMENT_METHODS.join(", ")}` });

    const order = await createOrderService(userId, shippingAddress, paymentMethod, shippingMethod);

    res.status(201).json({
      success: true,
      message: "Order placed. Complete payment to confirm.",
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        totalPrice: order.totalPrice,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || (error.message.includes("stock") || error.message.includes("cart") ? 400 : 500);
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

// ─── POST /orders/create-after-payment ───────────────────────────────────────
export const createOrderAfterPayment = async (req, res) => {
  try {
    const { paymentIntentId, shippingAddress, shippingMethod = "delivery", guestEmail, items: guestItems } = req.body;
    const userId = req.user?.userId ?? null;

    if (!paymentIntentId || !shippingAddress)
      return res.status(400).json({ success: false, message: "paymentIntentId and shippingAddress are required" });

    const { fullName, phone } = shippingAddress;
    if (!fullName || !phone)
      return res.status(400).json({ success: false, message: "shippingAddress must include: fullName, phone" });

    if (shippingMethod === "delivery" && (!shippingAddress.address || !shippingAddress.city || !shippingAddress.postalCode))
      return res.status(400).json({ success: false, message: "shippingAddress must include: address, city, postalCode for delivery orders" });

    if (!userId) {
      if (!guestEmail) return res.status(400).json({ success: false, message: "Email is required for guest checkout" });
      if (!guestItems || guestItems.length === 0) return res.status(400).json({ success: false, message: "Cart items are required for guest checkout" });
    }

    const guestData = !userId ? { guestEmail, items: guestItems } : null;
    const order = await createOrderAfterPaymentService(userId, paymentIntentId, shippingAddress, shippingMethod, guestData);

    res.status(201).json({
      success: true,
      message: "Order placed successfully.",
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        totalPrice: order.totalPrice,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── GET /orders/my-orders ───────────────────────────────────────────────────
export const getMyOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const result = await getMyOrdersService(req.user.userId, page, limit);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /orders/:id ─────────────────────────────────────────────────────────
export const getOrderById = async (req, res) => {
  try {
    const order = await getOrderByIdService(req.params.id, req.user.userId, req.user.role);
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    const statusCode =
      error.message === "Order not found" ? 404
      : error.message === "Access denied" ? 403
      : error.message === "Invalid order ID" ? 400
      : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

// ─── GET /orders/admin/all ───────────────────────────────────────────────────
export const getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, orderStatus, paymentStatus, shippingMethod, search, startDate, endDate } = req.query;
    const result = await getAllOrdersService({ orderStatus, paymentStatus, shippingMethod, search, startDate, endDate }, page, limit);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── PATCH /orders/admin/status/:id ─────────────────────────────────────────
export const updateOrderStatus = async (req, res) => {
  try {
    const { status, note, trackingNumber, courierName, trackingUrl, estimatedDeliveryDate, pickedUpBy } = req.body;

    if (!status)
      return res.status(400).json({ success: false, message: "status is required" });

    if (!ALLOWED_STATUSES.includes(status))
      return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(", ")}` });

    const order = await updateOrderStatusService(
      req.params.id,
      status,
      req.user.userId,
      note,
      { trackingNumber, courierName, trackingUrl, estimatedDeliveryDate, pickedUpBy },
    );

    res.status(200).json({
      success: true,
      message: `Order status updated to "${status}"`,
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
      },
    });
  } catch (error) {
    const statusCode = error.message.includes("Cannot transition") ? 400
      : error.message === "Order not found" ? 404
      : 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

// ─── POST /orders/cancel/:id ─────────────────────────────────────────────────
export const cancelOrder = async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await cancelOrderService(req.params.id, req.user.userId, req.user.role, reason);
    res.status(200).json({
      success: true,
      message: "Order cancelled successfully" + (result.refundId ? " and refund initiated" : ""),
      data: {
        orderId:            result.order._id,
        orderNumber:        result.order.orderNumber,
        orderStatus:        result.order.orderStatus,
        paymentStatus:      result.order.paymentStatus,
        cancellationReason: result.order.cancellationReason,
        refundId:           result.refundId,
        refundAmount:       result.refundAmount,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode ||
      (error.message === "Order not found" ? 404
      : error.message === "Access denied" ? 403
      : error.message.includes("Cannot cancel") || error.message.includes("already cancelled") ? 400
      : 500);
    res.status(statusCode).json({ success: false, message: error.message });
  }
};


// ─── POST /orders/request/cancel/:id

export const requestOrderCancellation = async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Validation: Reason required hona chahiye
    if (!reason || reason.trim() === "") {
      return res.status(400).json({ success: false, message: "Cancellation reason is required" });
    }

    const order = await requestCancellationService(req.params.id, req.user.userId, reason);

    res.status(200).json({
      success: true,
      message: "Cancellation request submitted successfully to admin.",
      data: {
        orderId: order._id,
        orderStatus: order.orderStatus,
        cancellationStatus: order.cancellationStatus,
        cancellationReason: order.cancellationReason
      }
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

// ─── GET /orders/admin/cancellation-requests ────────────────────────────────
export const getCancellationRequests = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await getCancellationRequestsService(page, limit);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── PATCH /orders/admin/cancellation-requests/:id/approve ───────────────────
export const approveCancellation = async (req, res) => {
  try {
    const result = await approveCancellationService(req.params.id, req.user.userId);
    res.status(200).json({
      success: true,
      message: "Cancellation request approved. Order cancelled" + (result.refundId ? " and refund initiated" : ""),
      data: {
        orderId: result.order._id,
        orderNumber: result.order.orderNumber,
        orderStatus: result.order.orderStatus,
        cancellationStatus: result.order.cancellationStatus,
        refundId: result.refundId,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── PATCH /orders/admin/cancellation-requests/:id/reject ────────────────────
export const rejectCancellation = async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await rejectCancellationService(req.params.id, req.user.userId, reason);
    res.status(200).json({
      success: true,
      message: "Cancellation request rejected",
      data: {
        orderId: order._id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        cancellationStatus: order.cancellationStatus,
        cancellationRejectionReason: order.cancellationRejectionReason,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── GET /orders/admin/stats ─────────────────────────────────────────────────
export const getOrderStats = async (req, res) => {
  try {
    const stats = await getOrderStatsService();
    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /orders/check-delivery ──────────────────────────────────────────────
export const checkDelivery = (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng)
    return res.status(400).json({ success: false, message: "lat and lng query params are required" });

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  if (isNaN(parsedLat) || isNaN(parsedLng))
    return res.status(400).json({ success: false, message: "lat and lng must be valid numbers" });

  const result = checkDeliveryAvailabilityService(parsedLat, parsedLng);
  res.status(200).json({ success: true, data: result });
};

// ─── GET /orders/track/:orderNumber (Public) ─────────────────────────────────
export const trackOrder = async (req, res) => {
  try {
    const data = await trackOrderService(req.params.orderNumber);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── POST /orders/track-guest (Public) ───────────────────────────────────────
export const trackGuestOrder = async (req, res) => {
  try {
    const { orderNumber, email } = req.body;
    if (!orderNumber || !email)
      return res.status(400).json({ success: false, message: "orderNumber and email are required" });

    const data = await trackGuestOrderService(orderNumber, email);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── DELETE /orders/admin/:id ─────────────────────────────────────────────────
export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id)
      return res.status(400).json({ success: false, message: "Order ID is required" });

    if (req.user.role !== "admin")
      return res.status(403).json({ success: false, message: "Access denied. Admins only." });

    const deletedOrder = await deleteOrderService(id);
    res.status(200).json({
      success: true,
      message: "Order deleted successfully",
      data: { orderId: deletedOrder._id, orderNumber: deletedOrder.orderNumber },
    });
  } catch (error) {
    res.status(error.message === "Order not found" ? 404 : 500).json({ success: false, message: error.message });
  }
};
