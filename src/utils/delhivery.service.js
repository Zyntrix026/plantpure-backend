import axios from "axios";

const DELHIVERY_BASE_URL = process.env.DELHIVERY_BASE_URL || "https://staging-express.delhivery.com";
const DELHIVERY_TOKEN = process.env.DELHIVERY_API_TOKEN;

/**
 * 1. Delhivery Waybill Fetch (Tracking Number fetch karne ke liye)
 */
export const fetchWaybill = async () => {
  try {
    const response = await axios.get(
      `${DELHIVERY_BASE_URL}/waybill/api/fetch/json/?token=${DELHIVERY_TOKEN}&count=1`
    );
    // Waybill response string ya array hota hai
    if (typeof response.data === "string") {
      return response.data.trim();
    }
    return response.data;
  } catch (error) {
    console.error("Delhivery Fetch Waybill Error:", error.response?.data || error.message);
    throw new Error("Failed to fetch Delhivery Waybill number");
  }
};

/**
 * 2. Delhivery Shipment Creation (Order Register karne ke liye)
 */
export const createDelhiveryShipment = async (order) => {
  try {
    // Waybill ID pehle fetch karein
    const waybill = await fetchWaybill();

    // Delivery Address payload format
    const shipping = order.shippingAddress;
    const paymentType = order.paymentMethod === "COD" ? "COD" : "PrePaid";

    // Delhivery B2C Creation Payload format
    const shipmentData = {
      shipments: [
        {
          name: shipping.fullName,
          add: shipping.address,
          pin: shipping.postalCode,
          city: shipping.city,
          state: shipping.state || "Delhi", // Default ya state variable
          country: shipping.country || "India",
          phone: shipping.phone,
          order: order.orderNumber,
          payment_mode: paymentType,
          return_pin: "",
          return_city: "",
          return_phone: "",
          return_add: "",
          return_state: "",
          return_country: "",
          products_desc: order.orderItems.map((i) => i.name).join(", "),
          hsn_code: "",
          cod_amount: paymentType === "COD" ? order.totalPrice.toString() : "0",
          order_date: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString(),
          total_amount: order.totalPrice.toString(),
          seller_add: "",
          seller_name: "PlantPure Store",
          seller_inv: "",
          quantity: order.orderItems.reduce((acc, i) => acc + i.quantity, 0).toString(),
          waybill: waybill,
          shipment_width: "10",
          shipment_height: "10",
          weight: "500", // Weight in grams
          seller_gst_tin: "",
          shipping_mode: "Surface",
          address_type: "home",
        },
      ],
      pickup_location: {
        name: process.env.DELHIVERY_PICKUP_LOCATION || "PlantPure_Warehouse",
      },
    };

    // Delhivery URL Encode Form Data accept karta hai (`format=json&data=...`)
    const params = new URLSearchParams();
    params.append("format", "json");
    params.append("data", JSON.stringify(shipmentData));

    const response = await axios.post(
      `${DELHIVERY_BASE_URL}/api/cmu/create.json`,
      params,
      {
        headers: {
          Authorization: `Token ${DELHIVERY_TOKEN}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (response.data?.success || response.data?.packages?.length > 0) {
      return {
        success: true,
        waybill: waybill,
        courierName: "Delhivery",
        trackingUrl: `https://www.delhivery.com/track/package/${waybill}`,
        rawResponse: response.data,
      };
    } else {
      return {
        success: false,
        error: JSON.stringify(response.data),
      };
    }
  } catch (error) {
    console.error("Delhivery Shipment Creation Error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.rmk || error.message,
    };
  }
};