import axios from "axios";

// ─── Config ───────────────────────────────────────────────────────────────────
// Correct Delhivery production API domain
const DELHIVERY_EXPRESS_URL = "https://api.delhivery.com";

const DELHIVERY_TOKEN = process.env.DELHIVERY_API_TOKEN;
const PICKUP_LOCATION = process.env.DELHIVERY_PICKUP_LOCATION || "CRAFTWORLD SURFACE";

// Seller/Return address — store address
const SELLER_NAME    = "PlantPure Store";
const SELLER_ADDRESS = "New Delhi";
const SELLER_PIN     = "110001";
const SELLER_CITY    = "New Delhi";
const SELLER_STATE   = "Delhi";
const SELLER_PHONE   = "9810999976";

/**
 * 1. Waybill fetch — ek unique tracking number milta hai Delhivery se
 */
export const fetchWaybill = async () => {
  const url = `${DELHIVERY_EXPRESS_URL}/waybill/api/fetch/json/?token=${DELHIVERY_TOKEN}&count=1`;
  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Token ${DELHIVERY_TOKEN}`,
        "Content-Type": "application/json",
      },
    });
    const raw = typeof res.data === "string" ? res.data.trim() : res.data;
    // console.log("Delhivery Waybill raw response:", raw);
    // Format: "1234567890" ya { waybill: ["1234567890"] }
    if (typeof raw === "string" && raw.length > 0) return raw;
    if (Array.isArray(raw?.waybill)) return raw.waybill[0];
    if (typeof raw?.waybill === "string") return raw.waybill;
    throw new Error(`Unexpected waybill response: ${JSON.stringify(raw)}`);
  } catch (err) {
    console.error("❌ Delhivery Waybill Fetch Error:", err.response?.data || err.message);
    throw new Error("Failed to fetch Delhivery waybill: " + (err.response?.data?.message || err.response?.data || err.message));
  }
};

/**
 * 2. Shipment create — order Delhivery panel mein register hota hai
 *    Yeh function order create hone ke baad call hota hai
 */
export const createDelhiveryShipment = async (order) => {
  try {
    const waybill = await fetchWaybill();
    // console.log("✅ Delhivery Waybill fetched:", waybill);

    const shipping    = order.shippingAddress;
    const paymentType = order.paymentMethod === "COD" ? "COD" : "Pre-paid";
    const orderDate   = (order.createdAt || new Date()).toISOString().split("T")[0]; // YYYY-MM-DD
    const totalQty    = order.orderItems.reduce((acc, i) => acc + i.quantity, 0);
    const productsDesc = order.orderItems.map((i) => `${i.name} x${i.quantity}`).join(", ");

    // Phone number clean — Delhivery 10 digit chahta hai
    const cleanPhone = (shipping.phone || "")
      .replace(/\D/g, "")
      .replace(/^91/, "")
      .slice(-10);

    const shipmentData = {
      shipments: [
        {
          // ── Customer / Delivery details ──────────────────────────────
          name:    shipping.fullName || "Customer",
          add:     shipping.address  || "",
          pin:     String(shipping.postalCode || "").replace(/\D/g, ""),
          city:    shipping.city    || "",
          state:   shipping.state   || "Delhi",
          country: "India",
          phone:   cleanPhone,

          // ── Order details ────────────────────────────────────────────
          order:        order.orderNumber,
          payment_mode: paymentType,
          order_date:   orderDate,
          total_amount: order.totalPrice.toFixed(2),
          cod_amount:   paymentType === "COD" ? order.totalPrice.toFixed(2) : "0",

          // ── Product details ──────────────────────────────────────────
          products_desc: productsDesc,
          hsn_code:      "",
          quantity:      String(totalQty),
          weight:        "0.5",   // kg mein — Delhivery kg expect karta hai
          shipment_width:  "10",  // cm
          shipment_height: "10",  // cm
          shipment_length: "10",  // cm

          // ── Waybill ──────────────────────────────────────────────────
          waybill: waybill,

          // ── Seller / Return details ──────────────────────────────────
          seller_name:    SELLER_NAME,
          seller_add:     SELLER_ADDRESS,
          seller_pin:     SELLER_PIN,
          seller_city:    SELLER_CITY,
          seller_state:   SELLER_STATE,
          seller_phone:   SELLER_PHONE,
          seller_inv:     order.orderNumber,
          seller_gst_tin: "",

          return_pin:     SELLER_PIN,
          return_city:    SELLER_CITY,
          return_phone:   SELLER_PHONE,
          return_add:     SELLER_ADDRESS,
          return_state:   SELLER_STATE,
          return_country: "India",

          // ── Shipping mode ────────────────────────────────────────────
          shipping_mode: "Surface",
          address_type:  "home",
        },
      ],
      pickup_location: {
        name: PICKUP_LOCATION,
      },
    };

    const params = new URLSearchParams();
    params.append("format", "json");
    params.append("data", JSON.stringify(shipmentData));

    // console.log("📦 Delhivery Shipment Payload:", JSON.stringify(shipmentData, null, 2));

    const response = await axios.post(
      `${DELHIVERY_EXPRESS_URL}/api/cmu/create.json`,
      params,
      {
        headers: {
          Authorization: `Token ${DELHIVERY_TOKEN}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    // console.log("📬 Delhivery API Raw Response:", JSON.stringify(response.data, null, 2));

    const pkg = response.data?.packages?.[0];
    const isSuccess = response.data?.success === true || (pkg && !pkg.error);

    if (isSuccess) {
      return {
        success:     true,
        waybill:     waybill,
        courierName: "Delhivery",
        trackingUrl: `https://www.delhivery.com/track/package/${waybill}`,
        rawResponse: response.data,
      };
    } else {
      const errMsg = pkg?.error || response.data?.rmk || JSON.stringify(response.data);
      console.error("❌ Delhivery Shipment Failed:", errMsg);
      return { success: false, error: errMsg };
    }
  } catch (err) {
    const errDetail = err.response?.data || err.message;
    console.error("❌ Delhivery Exception:", errDetail);
    return { success: false, error: JSON.stringify(errDetail) };
  }
};
