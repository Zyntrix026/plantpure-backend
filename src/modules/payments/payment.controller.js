import {
  createPaymentIntentFromCartService,
  createPaymentIntentService,
  handleWebhookService,
  getPaymentStatusService,
} from "./payment.service.js";

// ─── POST /api/payments/create-intent-from-cart ─────────────────────────────
export const createPaymentIntentFromCart = async (req, res) => {
  try {
    const { shippingAddress, shippingMethod = "delivery", items: guestItems, couponCode = null } = req.body;
    const userId = req.user?.userId ?? null;
    const data = await createPaymentIntentFromCartService(userId, shippingAddress, shippingMethod, guestItems, couponCode);
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── POST /api/payments/create-intent ────────────────────────────────────────
export const createPaymentIntent = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: "orderId is required" });
    }

    const data = await createPaymentIntentService(orderId, req.user.userId);

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── POST /api/payments/webhook ───────────────────────────────────────────────
// Note: this route uses express.raw() — registered separately in app.js
export const stripeWebhook = async (req, res) => {
  try {
    const signature = req.headers["stripe-signature"];

    if (!signature) {
      return res.status(400).json({ success: false, message: "Missing stripe-signature header" });
    }

    const result = await handleWebhookService(req.body, signature);
    res.status(200).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── GET /api/payments/status/:orderId ───────────────────────────────────────
export const getPaymentStatus = async (req, res) => {
  try {
    const data = await getPaymentStatusService(
      req.params.orderId,
      req.user.userId,
      req.user.role
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};
