// ─── Delivery Fee Config (easy to extend) ────────────────────────────────────

const DELIVERY_RULES = {
  SP: { withinRange: 10, outsideRange: 10 },
  BB: { withinRange: 15, outsideRange: 50 },
};

// Runtime getters — dotenv is guaranteed to be loaded by the time these are called
const getStoreCoords = () => ({ lat: parseFloat(process.env.STORE_LAT), lng: parseFloat(process.env.STORE_LNG) });
const getMaxKm       = () => parseFloat(process.env.MAX_DELIVERY_KM  || "160");
const getRangeKm     = () => parseFloat(process.env.DELIVERY_RANGE_KM || "16");

/**
 * Calculate delivery fee based on shipping_category and distance
 * Mixed cart → max charge rule applied by caller
 */
export const calcDeliveryFee = (shipping_category, distanceKm) => {
  const rule = DELIVERY_RULES[shipping_category] ?? DELIVERY_RULES.SP;
  return distanceKm <= getRangeKm() ? rule.withinRange : rule.outsideRange;
};

/**
 * Calculate final delivery charge for a cart
 * Applies max charge rule for mixed carts
 */
export const calcCartDeliveryFee = (cartItems, distanceKm) => {
  if (!cartItems || cartItems.length === 0) return 0;

  const hasInvalidDistance =
    distanceKm === null ||
    distanceKm === undefined ||
    isNaN(distanceKm) ||
    distanceKm < 0;

  if (hasInvalidDistance) {
    const err = new Error("Invalid or missing delivery distance");
    err.statusCode = 400;
    throw err;
  }

  // Get unique shipping categories in cart
  const categories = [...new Set(cartItems.map((i) => i.shipping_category ?? "SP"))];

  // Calculate fee for each category, apply max
  const fee = Math.max(...categories.map((cat) => calcDeliveryFee(cat, distanceKm)));
  return fee;
};

/**
 * Haversine formula — returns distance in Kilometers between two lat/lng points
 */
export const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Earth radius in Kilometers
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Validates delivery range — throws if outside MAX_DELIVERY_KM.
 */
export const validateDeliveryRange = (userLat, userLng) => {
  const { lat, lng } = getStoreCoords();
  const maxKm = getMaxKm();
  const distance = haversineDistance(lat, lng, userLat, userLng);
  if (distance > maxKm) {
    const err = new Error(
      `Delivery not available. Your location is ${distance.toFixed(1)} km away. We only deliver within ${maxKm} km.`
    );
    err.statusCode = 400;
    throw err;
  }
  return distance;
};
