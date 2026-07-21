import {
  createPaymentIntentFromCartService,
  createPaymentIntentService,
  handleWebhookService,
  getPaymentStatusService,
} from "./payment.service.js";

// ─── POST /api/payments/create-session ──────────────────────────────────────
// Used by registered checkout (Checkout.jsx)
export const createPaymentSession = async (req, res) => {
  try {
    const { shippingAddress, shippingMethod = "delivery", couponCode = null } = req.body;
    const userId = req.user?.userId ?? null;

    // Pass customer details from auth user if available
    const customerDetails = req.user
      ? { name: req.user.name, email: req.user.email, phone: req.user.phone }
      : {};

    const data = await createPaymentIntentFromCartService(userId, shippingAddress, shippingMethod, null, couponCode, customerDetails);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── POST /api/payments/create-intent-from-cart ──────────────────────────────
// Used by guest checkout (GuestCheckoutPage.jsx)
export const createPaymentIntentFromCart = async (req, res) => {
  try {
    const { shippingAddress, shippingMethod = "delivery", items: guestItems, couponCode = null, customerDetails = {} } = req.body;
    const userId = req.user?.userId ?? null;
    const data = await createPaymentIntentFromCartService(userId, shippingAddress, shippingMethod, guestItems, couponCode, customerDetails);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── POST /api/payments/create-intent ────────────────────────────────────────
export const createPaymentIntent = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, message: "orderId is required" });
    const data = await createPaymentIntentService(orderId, req.user.userId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── POST /api/payments/webhook ───────────────────────────────────────────────
export const cashfreeWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];

    if (!signature || !timestamp) {
      return res.status(400).json({ success: false, message: "Missing Cashfree webhook headers" });
    }

    const result = await handleWebhookService(req.body, signature, timestamp);
    res.status(200).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/payments/status/:orderId ───────────────────────────────────────
export const getPaymentStatus = async (req, res) => {
  try {
    const data = await getPaymentStatusService(req.params.orderId, req.user.userId, req.user.role);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};
