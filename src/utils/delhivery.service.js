import axios from "axios";

// ─── Config ───────────────────────────────────────────────────────────────────
// Correct Delhivery production API domain
const DELHIVERY_EXPRESS_URL = process.env.DELHIVERY_URL || "https://api.delhivery.com";

const getDelhiveryToken = () => process.env.DELHIVERY_API_TOKEN;
const getDefaultPickupLocation = () => process.env.DELHIVERY_PICKUP_LOCATION || "CRAFTWORLD SURFACE";

// Seller/Return address — store address
const SELLER_NAME    = process.env.STORE_NAME || "PlantPure Store";
const SELLER_ADDRESS = process.env.STORE_ADDRESS || "New Delhi";
const SELLER_PIN     = process.env.STORE_PIN || "110001";
const SELLER_CITY    = process.env.STORE_CITY || "New Delhi";
const SELLER_STATE   = process.env.STORE_STATE || "Delhi";
const SELLER_PHONE   = process.env.STORE_PHONE || "9810999976";

/**
 * 1. Waybill fetch — fetches a unique waybill/tracking number from Delhivery
 */
export const fetchWaybill = async () => {
  const token = getDelhiveryToken();
  if (!token) {
    throw new Error("DELHIVERY_API_TOKEN is not configured in environment");
  }

  const url = `${DELHIVERY_EXPRESS_URL}/waybill/api/fetch/json/?token=${token}&count=1`;
  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
    const raw = typeof res.data === "string" ? res.data.trim() : res.data;
    // Format: "1234567890" or { waybill: ["1234567890"] }
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
 * 2. Shipment create — registers order in Delhivery system
 *    Supports optional customOptions: { weight, length, width, height, pickupLocation, shippingMode, assignedWaybill }
 */
export const createDelhiveryShipment = async (order, customOptions = {}) => {
  const token = getDelhiveryToken();
  if (!token) {
    return { success: false, error: "DELHIVERY_API_TOKEN is not configured" };
  }

  try {
    const waybill = customOptions.assignedWaybill || await fetchWaybill();

    const shipping    = order.shippingAddress || {};
    const paymentType = order.paymentMethod === "COD" ? "COD" : "Pre-paid";
    const orderDate   = (order.createdAt || new Date()).toISOString().split("T")[0]; // YYYY-MM-DD
    const totalQty    = (order.orderItems || []).reduce((acc, i) => acc + (i.quantity || 1), 0);
    const productsDesc = (order.orderItems || []).map((i) => `${i.name || 'Product'} x${i.quantity || 1}`).join(", ");

    // Phone number clean — Delhivery expects 10 digit Indian number
    const cleanPhone = (shipping.phone || "")
      .replace(/\D/g, "")
      .replace(/^91/, "")
      .slice(-10);

    const weightKg = customOptions.weight ? String(customOptions.weight) : "0.5";
    const lengthCm = customOptions.length ? String(customOptions.length) : "10";
    const widthCm  = customOptions.width ? String(customOptions.width) : "10";
    const heightCm = customOptions.height ? String(customOptions.height) : "10";
    const pickupLoc = customOptions.pickupLocation || getDefaultPickupLocation();
    const shipMode  = customOptions.shippingMode || "Surface";

    const shipmentData = {
      shipments: [
        {
          // ── Customer / Delivery details ──────────────────────────────
          name:    shipping.fullName || "Customer",
          add:     shipping.address  || "",
          pin:     String(shipping.postalCode || "").replace(/\D/g, ""),
          city:    shipping.city    || "",
          state:   shipping.state   || "Delhi",
          country: shipping.country || "India",
          phone:   cleanPhone,

          // ── Order details ────────────────────────────────────────────
          order:        order.orderNumber,
          payment_mode: paymentType,
          order_date:   orderDate,
          total_amount: Number(order.totalPrice || 0).toFixed(2),
          cod_amount:   paymentType === "COD" ? Number(order.totalPrice || 0).toFixed(2) : "0",

          // ── Product details ──────────────────────────────────────────
          products_desc: productsDesc || "PlantPure Products",
          hsn_code:      "",
          quantity:      String(totalQty || 1),
          weight:        weightKg,   // in kg
          shipment_width:  widthCm,  // cm
          shipment_height: heightCm, // cm
          shipment_length: lengthCm, // cm

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
          shipping_mode: shipMode,
          address_type:  "home",
        },
      ],
      pickup_location: {
        name: pickupLoc,
      },
    };

    const params = new URLSearchParams();
    params.append("format", "json");
    params.append("data", JSON.stringify(shipmentData));

    const response = await axios.post(
      `${DELHIVERY_EXPRESS_URL}/api/cmu/create.json`,
      params,
      {
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        timeout: 15000,
      }
    );

    const pkg = response.data?.packages?.[0];
    const isSuccess = response.data?.success === true || (pkg && !pkg.error);

    if (isSuccess) {
      // Try to fetch packing slip PDF URL immediately
      let labelUrl = null;
      try {
        const labelResult = await fetchShippingLabel(waybill);
        if (labelResult?.success && labelResult?.labelUrl) {
          labelUrl = labelResult.labelUrl;
        }
      } catch (labelErr) {
        console.warn("⚠️ Could not fetch label URL during creation:", labelErr.message);
      }

      return {
        success:        true,
        waybill:        waybill,
        courierName:    "Delhivery",
        trackingUrl:    `https://www.delhivery.com/track/package/${waybill}`,
        labelUrl:       labelUrl,
        weight:         parseFloat(weightKg),
        dimensions:     { length: parseFloat(lengthCm), width: parseFloat(widthCm), height: parseFloat(heightCm) },
        pickupLocation: pickupLoc,
        shippingMode:   shipMode,
        rawResponse:    response.data,
      };
    } else {
      const errMsg = pkg?.error || pkg?.remarks?.[0] || response.data?.rmk || JSON.stringify(response.data);
      console.error("❌ Delhivery Shipment Failed:", errMsg);
      return { success: false, error: errMsg, waybill };
    }
  } catch (err) {
    const errDetail = err.response?.data || err.message;
    console.error("❌ Delhivery Exception:", errDetail);
    return { success: false, error: typeof errDetail === "object" ? JSON.stringify(errDetail) : errDetail };
  }
};

/**
 * 3. Fetch Shipping Label / Packing Slip (PDF) from Delhivery
 */
export const fetchShippingLabel = async (waybill) => {
  const token = getDelhiveryToken();
  if (!token) {
    throw new Error("DELHIVERY_API_TOKEN is not configured");
  }

  const url = `${DELHIVERY_EXPRESS_URL}/api/p/packing_slip?wbns=${waybill}&pdf=true`;
  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 12000,
    });

    const packages = res.data?.packages || [];
    const pkg = packages.find((p) => p.wbn === waybill) || packages[0];
    const pdfUrl = pkg?.pdf_download_link || null;

    return {
      success: true,
      waybill,
      labelUrl: pdfUrl,
      raw: res.data,
    };
  } catch (err) {
    console.error("❌ Delhivery Packing Slip Error:", err.response?.data || err.message);
    return {
      success: false,
      waybill,
      error: err.response?.data?.message || err.message,
    };
  }
};

/**
 * 4. Track Delhivery Shipment
 */
export const trackDelhiveryShipment = async (waybill) => {
  const token = getDelhiveryToken();
  if (!token) {
    throw new Error("DELHIVERY_API_TOKEN is not configured");
  }

  const url = `${DELHIVERY_EXPRESS_URL}/api/v1/packages/json/?waybill=${waybill}&token=${token}`;
  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Token ${token}`,
      },
      timeout: 10000,
    });

    const packageData = res.data?.ShipmentData?.[0]?.Shipment || res.data?.packages?.[0] || null;
    const scans = packageData?.Scans || [];
    const latestStatus = packageData?.Status?.Status || packageData?.status?.status || "In Transit";
    const statusLocation = packageData?.Status?.StatusLocation || packageData?.status?.location || "";
    const statusDateTime = packageData?.Status?.StatusDateTime || null;
    const expectedDelivery = packageData?.ExpectedDeliveryDate || null;

    return {
      success: true,
      waybill,
      status: latestStatus,
      location: statusLocation,
      statusDateTime,
      expectedDelivery,
      scans: scans.map((s) => ({
        scanType: s.ScanDetail?.ScanType || s.ScanType || "",
        scan: s.ScanDetail?.Scan || s.Scan || "",
        location: s.ScanDetail?.ScannedLocation || s.ScannedLocation || "",
        dateTime: s.ScanDetail?.ScanDateTime || s.ScanDateTime || "",
        instructions: s.ScanDetail?.Instructions || s.Instructions || "",
      })),
      raw: res.data,
    };
  } catch (err) {
    console.error("❌ Delhivery Track Error:", err.response?.data || err.message);
    return {
      success: false,
      waybill,
      error: err.response?.data?.message || err.message,
    };
  }
};

/**
 * 5. Cancel Delhivery Shipment
 */
export const cancelDelhiveryShipment = async (waybill) => {
  const token = getDelhiveryToken();
  if (!token) {
    throw new Error("DELHIVERY_API_TOKEN is not configured");
  }

  const url = `${DELHIVERY_EXPRESS_URL}/api/p/edit`;
  try {
    const res = await axios.post(
      url,
      {
        waybill: waybill,
        cancellation: "true",
      },
      {
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    return {
      success: true,
      waybill,
      data: res.data,
    };
  } catch (err) {
    console.error("❌ Delhivery Cancel Error:", err.response?.data || err.message);
    return {
      success: false,
      waybill,
      error: err.response?.data?.message || err.message,
    };
  }
};
