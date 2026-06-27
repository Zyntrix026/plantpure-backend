import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = `PlantPure <${process.env.FROM_EMAIL}>`;
const ADMIN = process.env.ADMIN_EMAIL;

const COMPANY_NAME = "PlantPure";
const COMPANY_PHONE = "+91-9810999976";
const COMPANY_EMAIL = "indiacraftworld@gmail.com";

const formatItems = (orderItems) =>
  orderItems
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">
            <div style="display:flex;align-items:center;gap:10px">
              ${
                item.image
                  ? `<img src="${item.image}" alt="${item.name}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid #e4e7ec;flex-shrink:0"/>`
                  : `<div style="width:44px;height:44px;border-radius:6px;background:#f9fafb;border:1px solid #e4e7ec;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px">📦</div>`
              }
              <span>${item.name}</span>
            </div>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${item.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right">₹${item.priceAtPurchase.toFixed(2)}</td>
        </tr>`,
    )
    .join("");

// ─── 1. User Order Confirmation ───────────────────────────────────────────────
export const sendOrderConfirmationToUser = async (
  userEmail,
  userName,
  order,
) => {
  const isPickup = order.shippingMethod === "store_pickup";
  const addr = order.shippingAddress;

  const methodBadge = isPickup
    ? `<span style="display:inline-block;padding:3px 10px;background:#dbeafe;color:#1e40af;border-radius:20px;font-size:12px;font-weight:700">🏪 Store Pickup</span>`
    : `<span style="display:inline-block;padding:3px 10px;background:#dcfce7;color:#166534;border-radius:20px;font-size:12px;font-weight:700">🚚 Home Delivery</span>`;

  const shippingInfo = isPickup
    ? `<p style="margin:4px 0"><strong>Method:</strong> ${methodBadge}</p>`
    : `<p style="margin:4px 0"><strong>Method:</strong> ${methodBadge}</p>
       <p style="margin:4px 0"><strong>Address:</strong> ${addr.address}, ${addr.city}, ${addr.postalCode}, ${addr.country}</p>`;

  await resend.emails.send({
    from: FROM,
    to: userEmail,
    subject: `Order Confirmed — ${order.orderNumber}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
        <div style="background:#1a3c5e;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">Order Confirmed ✅</h1>
        </div>
        <div style="padding:24px">
          <p>Hi <strong>${userName}</strong>,</p>
          <p>Thank you for your order! We've received your payment and your order is confirmed.</p>

          <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:20px 0">
            <p style="margin:4px 0"><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p style="margin:4px 0"><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
            <p style="margin:4px 0"><strong>Payment:</strong> Paid via Card</p>
            ${shippingInfo}
          </div>

          <h3 style="border-bottom:2px solid #f0f0f0;padding-bottom:8px">Order Items</h3>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#f0f0f0">
                <th style="padding:8px 12px;text-align:left">Product</th>
                <th style="padding:8px 12px;text-align:center">Qty</th>
                <th style="padding:8px 12px;text-align:right">Price</th>
              </tr>
            </thead>
            <tbody>${formatItems(order.orderItems)}</tbody>
          </table>

          <div style="margin-top:16px;text-align:right">
            <p style="margin:4px 0">Subtotal: <strong>₹${order.itemsPrice.toFixed(2)}</strong></p>
            <p style="margin:4px 0">Shipping: <strong>${order.shippingPrice === 0 ? "FREE" : `₹${order.shippingPrice.toFixed(2)}`}</strong></p>
            <p style="margin:4px 0;font-size:18px;color:#1a3c5e">Total: <strong>₹${order.totalPrice.toFixed(2)}</strong></p>
          </div>

          <p style="margin-top:24px">If you have any questions, reply to this email (${COMPANY_EMAIL}) or call us at <strong>${COMPANY_PHONE}</strong>.</p>
          <p>Thanks,<br/>${COMPANY_NAME} Team</p>
        </div>
      </div>
    `,
  });
};

// ─── 2. Admin New Order Alert ─────────────────────────────────────────────────
export const sendNewOrderAlertToAdmin = async (userEmail, userName, order) => {
  const isPickup = order.shippingMethod === "store_pickup";
  const addr = order.shippingAddress;

  const methodBadgeAdmin = isPickup
    ? `<span style="display:inline-block;padding:3px 10px;background:#dbeafe;color:#1e40af;border-radius:20px;font-size:12px;font-weight:700">🏪 Store Pickup</span>`
    : `<span style="display:inline-block;padding:3px 10px;background:#dcfce7;color:#166534;border-radius:20px;font-size:12px;font-weight:700">🚚 Home Delivery</span>`;

  const shippingInfo = isPickup
    ? `<p style="margin:4px 0"><strong>Method:</strong> ${methodBadgeAdmin}</p>`
    : `<p style="margin:4px 0"><strong>Method:</strong> ${methodBadgeAdmin}</p>
       <p style="margin:4px 0"><strong>Address:</strong> ${addr.address}, ${addr.city}, ${addr.postalCode}, ${addr.country}</p>`;

  await resend.emails.send({
    from: FROM,
    to: ADMIN,
    subject: `🛒 New Order — ${order.orderNumber} from ${userName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
        <div style="background:#e65c00;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">New Order Received 🛒</h1>
        </div>
        <div style="padding:24px">
          <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin-bottom:20px">
            <p style="margin:4px 0"><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p style="margin:4px 0"><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
            <p style="margin:4px 0"><strong>Customer:</strong> ${userName}</p>
            <p style="margin:4px 0"><strong>Email:</strong> ${userEmail}</p>
            <p style="margin:4px 0"><strong>Phone:</strong> ${addr.phone || COMPANY_PHONE}</p>
            ${shippingInfo}
          </div>

          <h3 style="border-bottom:2px solid #f0f0f0;padding-bottom:8px">Items Ordered</h3>
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#f0f0f0">
                <th style="padding:8px 12px;text-align:left">Product</th>
                <th style="padding:8px 12px;text-align:center">Qty</th>
                <th style="padding:8px 12px;text-align:right">Price</th>
              </tr>
            </thead>
            <tbody>${formatItems(order.orderItems)}</tbody>
          </table>

          <div style="margin-top:16px;text-align:right">
            <p style="margin:4px 0">Subtotal: <strong>₹${order.itemsPrice.toFixed(2)}</strong></p>
            <p style="margin:4px 0">Shipping: <strong>${order.shippingPrice === 0 ? "FREE" : `₹${order.shippingPrice.toFixed(2)}`}</strong></p>
            <p style="margin:4px 0;font-size:18px;color:#e65c00">Total: <strong>₹${order.totalPrice.toFixed(2)}</strong></p>
          </div>
        </div>
      </div>
    `,
  });
};

// ─── 3. Order Cancellation — Customer Email ──────────────────────────────────
export const sendCancellationEmailToCustomer = async (
  email,
  name,
  order,
  refundAmount,
) => {
  const itemsHtml = order.orderItems
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0">${item.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center">${item.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right">₹${item.priceAtPurchase.toFixed(2)}</td>
      </tr>`,
    )
    .join("");

  await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Order Cancelled & Refund Initiated — ${order.orderNumber}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
        <div style="background:#b91c1c;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">Order Cancelled ❌</h1>
        </div>
        <div style="padding:24px">
          <p>Hi <strong>${name}</strong>,</p>
          <p>Your order has been cancelled. A full refund of <strong>₹${refundAmount.toFixed(2)}</strong> has been initiated to your original payment method.</p>
          <p style="font-size:13px;color:#666">Refunds typically appear within 5–10 business days depending on your bank.</p>
          <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:20px 0">
            <p style="margin:4px 0"><strong>Order Number:</strong> ${order.orderNumber}</p>
            <p style="margin:4px 0"><strong>Cancelled On:</strong> ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
            <p style="margin:4px 0"><strong>Refund Amount:</strong> ₹${refundAmount.toFixed(2)}</p>
            ${order.cancellationReason ? `<p style="margin:4px 0"><strong>Reason:</strong> ${order.cancellationReason}</p>` : ""}
          </div>
          <h3 style="border-bottom:2px solid #f0f0f0;padding-bottom:8px">Cancelled Items</h3>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#f0f0f0">
              <th style="padding:8px 12px;text-align:left">Product</th>
              <th style="padding:8px 12px;text-align:center">Qty</th>
              <th style="padding:8px 12px;text-align:right">Price</th>
            </tr></thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <p style="margin-top:24px">Questions? Contact us at <strong>${COMPANY_PHONE}</strong> or email us via <strong>${COMPANY_EMAIL}</strong>.</p>
          <p>Thanks,<br/>${COMPANY_NAME} Team</p>
        </div>
      </div>`,
  });
};

// ─── 4. Order Cancellation — Admin Alert ──────────────────────────────────────
export const sendCancellationAlertToAdmin = async (
  order,
  refundId,
  cancelledBy,
) => {
  await resend.emails.send({
    from: FROM,
    to: ADMIN,
    subject: `🚫 Order Cancelled — ${order.orderNumber} | Refund: ₹${order.totalPrice.toFixed(2)}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#333">
        <div style="background:#7c3aed;padding:24px;text-align:center">
          <h1 style="color:#fff;margin:0;font-size:22px">Order Cancelled 🚫</h1>
        </div>
        <div style="padding:24px">
          <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin-bottom:20px">
            <p style="margin:4px 0"><strong>Order:</strong> ${order.orderNumber}</p>
            <p style="margin:4px 0"><strong>Cancelled By:</strong> ${cancelledBy}</p>
            <p style="margin:4px 0"><strong>Reason:</strong> ${order.cancellationReason || "Not specified"}</p>
            <p style="margin:4px 0"><strong>Refund Amount:</strong> ₹${order.totalPrice.toFixed(2)}</p>
            <p style="margin:4px 0"><strong>Stripe Refund ID:</strong> <code>${refundId || "N/A"}</code></p>
            <p style="margin:4px 0"><strong>Cancelled At:</strong> ${new Date().toLocaleString("en-GB")}</p>
          </div>
        </div>
      </div>`,
  });
};

// ─── 5. ADMIN STOCK ALERT EMAIL TRIGGER FUNCTION ─────────────────
export const sendOutOfStockAlertToAdmin = async (zeroStockItems) => {
  const itemsHtml = zeroStockItems
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #F2F4F7;">
        <td style="padding: 16px 12px; text-align: left; vertical-align: middle;">
          <div style="display: inline-block; vertical-align: middle;">
            ${
              item.image
                ? `<img src="${item.image}" alt="${item.name}" style="width: 44px; height: 44px; object-fit: cover; border-radius: 8px; border: 1px solid #E4E7EC; margin-right: 12px; display: block;"/>`
                : `<div style="width: 44px; height: 44px; border-radius: 8px; background: #F9FAFB; border: 1px solid #E4E7EC; margin-right: 12px; display: inline-block; text-align: center; line-height: 44px; color: #98A2B3; font-size: 20px; font-weight: bold;">📦</div>`
            }
          </div>
          <div style="display: inline-block; vertical-align: middle; max-width: 280px;">
            <p style="margin: 0; font-size: 14px; font-weight: 600; color: #101828; line-height: 1.4;">${item.name || "Unknown Product"}</p>
            ${item.variantLabel ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #667085; font-weight: 500;">Variant: ${item.variantLabel}</p>` : ""}
          </div>
        </td>
        <td style="padding: 16px 12px; text-align: center; vertical-align: middle;">
          <span style="display: inline-block; padding: 4px 10px; background: ${item.currentStock === 0 ? '#FEF3F2' : '#FFFBEB'}; color: ${item.currentStock === 0 ? '#B42318' : '#B45309'}; font-size: 12px; font-weight: 700; border-radius: 6px; border: 1px solid ${item.currentStock === 0 ? '#FECDCA' : '#FDE68A'};">
            ${item.currentStock === 0 ? '🔴 Out of Stock' : `🟡 Low Stock — ${item.currentStock} left`}
          </span>
        </td>
        <td style="padding: 16px 12px; text-align: right; vertical-align: middle; font-size: 13px; color: #475467; font-family: 'Courier New', Courier, monospace; font-weight: 600;">
          ${item.productId}
        </td>
      </tr>
    `,
    )
    .join("");

  await resend.emails.send({
    from: FROM,
    to: ADMIN,
    subject: `🚨 Inventory Alert: Low Stock & Out of Stock Items`,
    html: `
      <div style="background-color: #F9FAFB; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E4E7EC; box-shadow: 0px 4px 6px -2px rgba(16, 24, 40, 0.03), 0px 12px 16px -4px rgba(16, 24, 40, 0.08); overflow: hidden;">
          
          <div style="background: #D92D20; padding: 32px 24px; text-align: center;">
            <div style="display: inline-block; background: rgba(255, 255, 255, 0.15); padding: 8px; border-radius: 50%; margin-bottom: 12px;">
              <span style="font-size: 24px;">⚠️</span>
            </div>
            <h1 style="color: #FFFFFF; margin: 0; font-size: 24px; font-weight: 700;">Inventory Stock Alert</h1>
            <p style="color: #FEE4E2; margin: 6px 0 0 0; font-size: 14px; font-weight: 500;">Low stock or out of stock items detected</p>
          </div>

          <div style="padding: 32px 24px;">
            <p style="font-size: 16px; font-weight: 600; color: #101828; margin-top: 0; margin-bottom: 8px;">Hi Admin,</p>
            <p style="font-size: 15px; line-height: 1.6; color: #475467; margin: 0;">
              The following items require your attention after recent orders. Please review and restock as needed.
            </p>

            <table style="width: 100%; border-collapse: collapse; margin-top: 24px; margin-bottom: 24px;">
              <thead>
                <tr style="background: #F9FAFB; border-bottom: 2px solid #EAECF0;">
                  <th style="padding: 12px; text-align: left; font-size: 12px; font-weight: 700; color: #475467; text-transform: uppercase; letter-spacing: 0.05em;">Product Details</th>
                  <th style="padding: 12px; text-align: center; font-size: 12px; font-weight: 700; color: #475467; text-transform: uppercase; letter-spacing: 0.05em;">Stock Status</th>
                  <th style="padding: 12px; text-align: right; font-size: 12px; font-weight: 700; color: #475467; text-transform: uppercase; letter-spacing: 0.05em;">SKU / ID</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div style="padding: 16px; background: #FFFCF5; border-left: 4px solid #D97706; border-radius: 6px; border-top: 1px solid #FEF08A; border-right: 1px solid #FEF08A; border-bottom: 1px solid #FEF08A;">
              <p style="margin: 0; font-size: 13px; color: #B45309; line-height: 1.5; font-weight: 500;">
                <strong>System Notice:</strong> These products are active on the store pipeline front-end but users will encounter checkout blockages if order parameters cross zero thresholds.
              </p>
            </div>

            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #EAECF0; text-align: center;">
              <p style="margin: 0; font-size: 13px; font-weight: 600; color: #344054;">${COMPANY_NAME}</p>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #667085;">Automated Supply Operations Engine • Confidential Admin Communication</p>
            </div>

          </div>
        </div>
      </div>
    `,
  });
};

// ─── 6. Send Ready for Pickup Email ─────────────────
export const sendReadyForPickupEmail = async (order, userEmail, userName) => {
  const itemsHtml = order.orderItems
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #F2F4F7;">
        <td style="padding: 16px 12px; text-align: left; vertical-align: middle;">
          <div style="display: inline-block; vertical-align: middle;">
            ${
              item.image
                ? `<img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; border: 1px solid #E4E7EC; margin-right: 12px; display: block;"/>`
                : `<div style="width: 50px; height: 50px; border-radius: 8px; background: #F9FAFB; border: 1px solid #E4E7EC; margin-right: 12px; display: inline-block; text-align: center; line-height: 50px; color: #98A2B3; font-size: 20px; font-weight: bold;">📦</div>`
            }
          </div>
          <div style="display: inline-block; vertical-align: middle; max-width: 260px;">
            <p style="margin: 0; font-size: 14px; font-weight: 600; color: #101828; line-height: 1.4;">${item.name || "Unknown Product"}</p>
            ${item.variantLabel ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #667085; font-weight: 500;">Variant: ${item.variantLabel}</p>` : ""}
          </div>
        </td>
        <td style="padding: 16px 12px; text-align: center; vertical-align: middle; font-size: 14px; color: #475467; font-weight: 600;">
          x${item.quantity}
        </td>
        <td style="padding: 16px 12px; text-align: right; vertical-align: middle; font-size: 14px; color: #101828; font-weight: 600;">
          ₹${(item.priceAtPurchase * item.quantity).toFixed(2)}
        </td>
      </tr>
    `,
    )
    .join("");

  const customerName =
    userName || order.shippingAddress?.fullName || "Valued Customer";

  await resend.emails.send({
    from: FROM,
    to: userEmail,
    subject: `🛒 Your Order ${order.orderNumber} is Ready for Store Pickup!`,
    html: `
      <div style="background-color: #F8FAFC; padding: 40px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.03); overflow: hidden;">
          
          <div style="background: #1E3A8A; padding: 36px 24px; text-align: center;">
            <div style="display: inline-block; background: rgba(255, 255, 255, 0.15); padding: 12px; border-radius: 50%; margin-bottom: 12px;">
              <span style="font-size: 28px;">🎉</span>
            </div>
            <h1 style="color: #FFFFFF; margin: 0; font-size: 24px; font-weight: 700;">Ready for Collection!</h1>
            <p style="color: #93C5FD; margin: 6px 0 0 0; font-size: 14px; font-weight: 500;">Your order is packed and waiting for you</p>
          </div>

          <div style="padding: 32px 24px;">
            <p style="font-size: 16px; font-weight: 600; color: #101828; margin-top: 0; margin-bottom: 8px;">Hi ${customerName},</p>
            <p style="font-size: 15px; line-height: 1.6; color: #475467; margin: 0;">
              Great news! Our team has fully prepared your items. You can now visit our store location to pick up your package.
            </p>

            <div style="margin-top: 28px; margin-bottom: 28px; background: #F0FDF4; border: 2px dashed #4ADE80; border-radius: 12px; padding: 20px; text-align: center;">
              <p style="margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #166534; font-weight: 700;">Your Unique Pickup Pass</p>
              <h2 style="margin: 8px 0; font-size: 32px; font-family: 'Courier New', Courier, monospace; font-weight: 800; color: #15803D; letter-spacing: 4px;">
                ${order.pickupDetails?.pickupCode || "N/A"}
              </h2>
              <p style="margin: 0; font-size: 13px; color: #166534; font-weight: 500;">
                Please present this code or your Order ID <strong>${order.orderNumber}</strong> to the store counter executive.
              </p>
            </div>

            <h3 style="font-size: 14px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">Items to Collect</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              <thead>
                <tr style="background: #F8FAFC; border-bottom: 2px solid #E2E8F0;">
                  <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Product</th>
                  <th style="padding: 12px; text-align: center; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Qty</th>
                  <th style="padding: 12px; text-align: right; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <div style="padding: 16px; background: #FFFBEB; border-left: 4px solid #F59E0B; border-radius: 6px; margin-bottom: 32px;">
              <p style="margin: 0; font-size: 13px; color: #B45309; line-height: 1.5; font-weight: 500;">
                <strong>Store Notice:</strong> Make sure to bring a valid photo ID along with the pickup code. Our operations timings are Mon - Fri: 8 AM - 5:30 PM Sat: 9 AM - 5:30 PM Sun: Closed. For assistance, contact support via <strong>${COMPANY_EMAIL}</strong> or call <strong>${COMPANY_PHONE}</strong>.
              </p>
            </div>

            <div style="padding-top: 24px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1E3A8A;">${COMPANY_NAME}</p>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748B;">Thank you for shopping local with us! • Automated Notification</p>
            </div>

          </div>
        </div>
      </div>
    `,
  });
};

// ─── 7. Send mail for delivered orders ─────────────────
export const sendOrderDeliveredEmail = async (order, userEmail, userName) => {
  const itemsHtml = order.orderItems
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #F2F4F7;">
        <td style="padding: 16px 12px; text-align: left; vertical-align: middle;">
          <div style="display: inline-block; vertical-align: middle;">
            ${
              item.image
                ? `<img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; border: 1px solid #E4E7EC; margin-right: 12px; display: block;"/>`
                : `<div style="width: 50px; height: 50px; border-radius: 8px; background: #F9FAFB; border: 1px solid #E4E7EC; margin-right: 12px; display: inline-block; text-align: center; line-height: 50px; color: #98A2B3; font-size: 20px; font-weight: bold;">📦</div>`
            }
          </div>
          <div style="display: inline-block; vertical-align: middle; max-width: 260px;">
            <p style="margin: 0; font-size: 14px; font-weight: 600; color: #101828; line-height: 1.4;">${item.name || "Unknown Product"}</p>
            ${item.variantLabel ? `<p style="margin: 2px 0 0 0; font-size: 12px; color: #667085; font-weight: 500;">Variant: ${item.variantLabel}</p>` : ""}
          </div>
        </td>
        <td style="padding: 16px 12px; text-align: center; vertical-align: middle; font-size: 14px; color: #475467; font-weight: 600;">
          x${item.quantity}
        </td>
        <td style="padding: 16px 12px; text-align: right; vertical-align: middle; font-size: 14px; color: #101828; font-weight: 600;">
          ₹${(item.priceAtPurchase * item.quantity).toFixed(2)}
        </td>
      </tr>
    `,
    )
    .join("");

  const customerName =
    userName || order.shippingAddress?.fullName || "Valued Customer";
  const deliveryAddress = order.shippingAddress;

  await resend.emails.send({
    from: FROM,
    to: userEmail,
    subject: `📦 Your Order ${order.orderNumber} Has Been Successfully Delivered!`,
    html: `
      <div style="background-color: #F8FAFC; padding: 40px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; border: 1px solid #E2E8F0; box-shadow: 0px 4px 12px rgba(0, 0, 0, 0.03); overflow: hidden;">
          
          <div style="background: #059669; padding: 36px 24px; text-align: center;">
            <div style="display: inline-block; background: rgba(255, 255, 255, 0.15); padding: 12px; border-radius: 50%; margin-bottom: 12px;">
              <span style="font-size: 28px;">✅</span>
            </div>
            <h1 style="color: #FFFFFF; margin: 0; font-size: 24px; font-weight: 700;">Order Delivered!</h1>
            <p style="color: #A7F3D0; margin: 6px 0 0 0; font-size: 14px; font-weight: 500;">Your package has arrived at its destination</p>
          </div>

          <div style="padding: 32px 24px;">
            <p style="font-size: 16px; font-weight: 600; color: #101828; margin-top: 0; margin-bottom: 8px;">Hi ${customerName},</p>
            <p style="font-size: 15px; line-height: 1.6; color: #475467; margin: 0;">
              Your shipment was successfully dropped off today. We hope your items arrived in perfect condition and that you love your purchase!
            </p>

            <div style="margin-top: 28px; margin-bottom: 28px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding-bottom: 8px; font-size: 13px; color: #64748B; font-weight: 500; width: 40%;">Order Number:</td>
                  <td style="padding-bottom: 8px; font-size: 13px; color: #101828; font-weight: 600;">${order.orderNumber}</td>
                </tr>
                <tr>
                  <td style="padding-bottom: 8px; font-size: 13px; color: #64748B; font-weight: 500;">Delivery Address:</td>
                  <td style="padding-bottom: 8px; font-size: 13px; color: #475467; font-weight: 500; line-height: 1.4;">
                    <strong>${deliveryAddress?.fullName}</strong><br/>
                    ${deliveryAddress?.address ? `${deliveryAddress.address},<br/>` : ""}
                    ${deliveryAddress?.city ? `${deliveryAddress.city}, ` : ""}${deliveryAddress?.postalCode || ""}<br/>
                    ${deliveryAddress?.country || "United Kingdom"}
                  </td>
                </tr>
                ${
                  order.trackingDetails?.trackingNumber
                    ? `
                <tr>
                  <td style="padding-top: 8px; font-size: 13px; color: #64748B; font-weight: 500;">Courier Tracking:</td>
                  <td style="padding-top: 8px; font-size: 13px; color: #101828; font-weight: 600;">
                    ${order.trackingDetails.courierName || "Parcel Service"} (${order.trackingDetails.trackingNumber})
                  </td>
                </tr>
                `
                    : ""
                }
              </table>
            </div>

            <h3 style="font-size: 14px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">Delivered Summary</h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              <thead>
                <tr style="background: #F8FAFC; border-bottom: 2px solid #E2E8F0;">
                  <th style="padding: 12px; text-align: left; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Product</th>
                  <th style="padding: 12px; text-align: center; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Qty</th>
                  <th style="padding: 12px; text-align: right; font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase;">Total Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="2" style="padding: 16px 12px 4px 12px; text-align: right; font-size: 14px; color: #64748B; font-weight: 500;">Subtotal:</td>
                  <td style="padding: 16px 12px 4px 12px; text-align: right; font-size: 14px; color: #101828; font-weight: 600;">₹${order.itemsPrice.toFixed(2)}</td>
                </tr>
                <tr>
                  <td colspan="2" style="padding: 4px 12px; text-align: right; font-size: 14px; color: #64748B; font-weight: 500;">Shipping:</td>
                  <td style="padding: 4px 12px; text-align: right; font-size: 14px; color: #101828; font-weight: 600;">₹${order.shippingPrice.toFixed(2)}</td>
                </tr>
                <tr style="border-top: 1px solid #EAECF0;">
                  <td colspan="2" style="padding: 12px 12px 0 12px; text-align: right; font-size: 16px; color: #101828; font-weight: 700;">Grand Total:</td>
                  <td style="padding: 12px 12px 0 12px; text-align: right; font-size: 18px; color: #059669; font-weight: 700;">₹${order.totalPrice.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>

            <div style="padding: 16px; background: #EFF6FF; border-left: 4px solid #3B82F6; border-radius: 6px; margin-bottom: 32px;">
              <p style="margin: 0; font-size: 13px; color: #1E40AF; line-height: 1.5; font-weight: 500;">
                <strong>Need Support?</strong> If you haven't received your package or find any discrepancy, please reach out to our helpdesk at <strong>${COMPANY_EMAIL}</strong> or call <strong>${COMPANY_PHONE}</strong> within 48 hours.
              </p>
            </div>

            <div style="padding-top: 24px; border-top: 1px solid #E2E8F0; text-align: center;">
              <p style="margin: 0; font-size: 14px; font-weight: 600; color: #101828;">${COMPANY_NAME}</p>
              <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748B;">Thank you for shopping local with us! • Automated Notification</p>
            </div>

          </div>
        </div>
      </div>
    `,
  });
};