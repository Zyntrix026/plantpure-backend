import { Coupon } from "./coupon.model.js";
import { CouponUsage } from "./couponUsage.model.js";
import { Order } from "../orders/order.model.js";

// ─── HELPER: Calculate discount amount ───────────────────────────────────────
// cartItems: array of { basePrice, discountPrice, quantity, productId, categories }
// Returns: { discountAmount, eligibleSubtotal, isFreeShipping }
export const calculateCouponDiscount = (coupon, cartItems, cartTotal) => {
  let discountAmount = 0;
  let isFreeShipping = false;

  if (coupon.type === "free_shipping") {
    isFreeShipping = true;
    return { discountAmount: 0, isFreeShipping: true };
  }

  if (coupon.type === "product_specific") {
    // Sirf applicable products ka subtotal pe discount
    const eligibleItems = cartItems.filter((item) =>
      coupon.applicableProducts.some(
        (pid) => pid.toString() === item.productId.toString()
      )
    );
    if (eligibleItems.length === 0) {
      throw Object.assign(
        new Error("No eligible products in cart for this coupon"),
        { statusCode: 400 }
      );
    }
    const eligibleSubtotal = eligibleItems.reduce((acc, item) => {
      const price = item.discountPrice ?? item.basePrice;
      return acc + price * item.quantity;
    }, 0);

    discountAmount = applyDiscountFormula(coupon, eligibleSubtotal);
    return { discountAmount, isFreeShipping: false };
  }

  if (coupon.type === "category_specific") {
    // Sirf applicable categories ke items pe discount
    const eligibleItems = cartItems.filter((item) =>
      item.categories?.some((catId) =>
        coupon.applicableCategories.some(
          (cid) => cid.toString() === catId.toString()
        )
      )
    );
    if (eligibleItems.length === 0) {
      throw Object.assign(
        new Error("No eligible categories in cart for this coupon"),
        { statusCode: 400 }
      );
    }
    const eligibleSubtotal = eligibleItems.reduce((acc, item) => {
      const price = item.discountPrice ?? item.basePrice;
      return acc + price * item.quantity;
    }, 0);

    discountAmount = applyDiscountFormula(coupon, eligibleSubtotal);
    return { discountAmount, isFreeShipping: false };
  }

  // percentage, flat, first_order, user_specific — full cart pe apply
  discountAmount = applyDiscountFormula(coupon, cartTotal);
  return { discountAmount, isFreeShipping: false };
};

// ─── HELPER: Apply formula based on type ─────────────────────────────────────
const applyDiscountFormula = (coupon, subtotal) => {
  let discount = 0;

  if (coupon.type === "percentage" || coupon.type === "first_order" || coupon.type === "user_specific") {
    discount = (subtotal * coupon.value) / 100;
    // maxDiscount cap
    if (coupon.maxDiscount != null) {
      discount = Math.min(discount, coupon.maxDiscount);
    }
  } else if (coupon.type === "flat" || coupon.type === "product_specific" || coupon.type === "category_specific") {
    discount = coupon.value;
  }

  // Discount subtotal se zyada nahi ho sakta
  discount = Math.min(discount, subtotal);
  return Number(discount.toFixed(2));
};

// ─── CORE: Validate coupon — all rules ───────────────────────────────────────
// Returns coupon document if valid, throws error if not
export const validateCouponService = async ({
  code,
  userId,       // null for guest
  cartItems,    // [{ productId, basePrice, discountPrice, quantity, categories }]
  cartTotal,    // ex-VAT total before coupon
  isGuest = false,
}) => {
  if (!code || !code.trim()) {
    throw Object.assign(new Error("Coupon code is required"), { statusCode: 400 });
  }

  // 1. Exist check
  const coupon = await Coupon.findOne({ code: code.trim().toUpperCase() });
  if (!coupon) {
    throw Object.assign(new Error("Invalid coupon code"), { statusCode: 404 });
  }

  // 2. Active check
  if (!coupon.isActive) {
    throw Object.assign(new Error("This coupon is no longer active"), { statusCode: 400 });
  }

  // 3. Start date check — server time use karo
  const now = new Date();
  if (coupon.startDate && now < coupon.startDate) {
    throw Object.assign(new Error("This coupon is not yet active"), { statusCode: 400 });
  }

  // 4. Expiry check — server time
  if (now > coupon.expiryDate) {
    throw Object.assign(new Error("This coupon has expired"), { statusCode: 400 });
  }

  // 5. Global usage limit check
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
    throw Object.assign(new Error("This coupon has reached its usage limit"), { statusCode: 400 });
  }

  // 6. Minimum order amount check
  if (cartTotal < coupon.minOrderAmount) {
    throw Object.assign(
      new Error(`Minimum order amount of £${coupon.minOrderAmount.toFixed(2)} required for this coupon`),
      { statusCode: 400 }
    );
  }

  // 7. User-specific checks (skip for guest)
  if (!isGuest && userId) {
    // user_specific: check allowedUsers
    if (coupon.type === "user_specific" && coupon.allowedUsers.length > 0) {
      const isAllowed = coupon.allowedUsers.some(
        (uid) => uid.toString() === userId.toString()
      );
      if (!isAllowed) {
        throw Object.assign(new Error("You are not eligible for this coupon"), { statusCode: 403 });
      }
    }

    // first_order: user ka koi paid order nahi hona chahiye
    if (coupon.type === "first_order") {
      const existingOrder = await Order.findOne({
        userId,
        paymentStatus: "paid",
      }).lean();
      if (existingOrder) {
        throw Object.assign(new Error("This coupon is only valid on your first order"), { statusCode: 400 });
      }
    }

    // Per-user usage limit check
    const userUsageCount = await CouponUsage.countDocuments({
      couponId: coupon._id,
      userId,
    });
    if (userUsageCount >= coupon.perUserLimit) {
      throw Object.assign(
        new Error(`You have already used this coupon ${coupon.perUserLimit > 1 ? coupon.perUserLimit + " times" : ""}`),
        { statusCode: 400 }
      );
    }
  }

  // 8. Guest restrictions — first_order aur user_specific guests ke liye nahi
  if (isGuest && (coupon.type === "first_order" || coupon.type === "user_specific")) {
    throw Object.assign(
      new Error("This coupon is not available for guest checkout"),
      { statusCode: 400 }
    );
  }

  // 9. Product/Category eligibility check
  if (coupon.type === "product_specific" && coupon.applicableProducts.length > 0) {
    const hasEligible = cartItems.some((item) =>
      coupon.applicableProducts.some(
        (pid) => pid.toString() === item.productId.toString()
      )
    );
    if (!hasEligible) {
      throw Object.assign(
        new Error("No eligible products in your cart for this coupon"),
        { statusCode: 400 }
      );
    }
  }

  if (coupon.type === "category_specific" && coupon.applicableCategories.length > 0) {
    const hasEligible = cartItems.some((item) =>
      item.categories?.some((catId) =>
        coupon.applicableCategories.some(
          (cid) => cid.toString() === catId.toString()
        )
      )
    );
    if (!hasEligible) {
      throw Object.assign(
        new Error("No eligible categories in your cart for this coupon"),
        { statusCode: 400 }
      );
    }
  }

  // All validations passed — calculate discount
  const { discountAmount, isFreeShipping } = calculateCouponDiscount(
    coupon,
    cartItems,
    cartTotal
  );

  return {
    coupon,
    discountAmount,
    isFreeShipping,
    finalTotal: Number(Math.max(cartTotal - discountAmount, 0).toFixed(2)),
  };
};

// ─── ATOMIC: Record coupon usage after successful payment ─────────────────────
// findOneAndUpdate with condition — race condition proof
export const recordCouponUsageService = async ({
  couponId,
  couponCode,
  userId,
  orderId,
  guestEmail,
  discountAmount,
}) => {
  // Atomic increment — only if limit not exceeded
  const updated = await Coupon.findOneAndUpdate(
    {
      _id: couponId,
      isActive: true,
      $or: [
        { usageLimit: null },
        { $expr: { $lt: ["$usageCount", "$usageLimit"] } },
      ],
    },
    {
      $inc: {
        usageCount: 1,
        totalDiscountGiven: discountAmount,
      },
    },
    { new: true }
  );

  if (!updated) {
    // Coupon limit reached between validate and payment — log but don't block order
    console.warn(`Coupon ${couponCode} limit reached during atomic increment for order ${orderId}`);
    return;
  }

  // Save usage record
  await CouponUsage.create({
    couponId,
    userId: userId || null,
    orderId,
    guestEmail: guestEmail || null,
    discountAmount,
    couponCode,
  });
};

// ─── ROLLBACK: Decrement usage on payment failure ─────────────────────────────
export const rollbackCouponUsageService = async ({ couponId, discountAmount, orderId }) => {
  await Promise.all([
    Coupon.findByIdAndUpdate(couponId, {
      $inc: {
        usageCount: -1,
        totalDiscountGiven: -discountAmount,
      },
    }),
    CouponUsage.deleteOne({ orderId }),
  ]);
};

// ─── ADMIN: Get all coupons ───────────────────────────────────────────────────
export const getAllCouponsService = async ({ search, status, type, page, limit }) => {
  const parsedPage = parseInt(page) || 1;
  const parsedLimit = parseInt(limit) || 10;
  const skip = (parsedPage - 1) * parsedLimit;

  const query = {};
  if (status === "active") query.isActive = true;
  else if (status === "inactive") query.isActive = false;
  if (type) query.type = type;
  if (search) {
    query.$or = [
      { code: { $regex: search.trim(), $options: "i" } },
      { description: { $regex: search.trim(), $options: "i" } },
    ];
  }

  const [coupons, total] = await Promise.all([
    Coupon.find(query)
      .sort("-createdAt")
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    Coupon.countDocuments(query),
  ]);

  return {
    data: coupons,
    total,
    totalPages: Math.ceil(total / parsedLimit) || 1,
    currentPage: parsedPage,
  };
};

// ─── ADMIN: Get coupon usage history ─────────────────────────────────────────
export const getCouponUsageService = async (couponId, { page, limit }) => {
  const parsedPage = parseInt(page) || 1;
  const parsedLimit = parseInt(limit) || 10;
  const skip = (parsedPage - 1) * parsedLimit;

  const [usages, total] = await Promise.all([
    CouponUsage.find({ couponId })
      .populate("userId", "name email")
      .populate("orderId", "orderNumber totalPrice")
      .sort("-createdAt")
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    CouponUsage.countDocuments({ couponId }),
  ]);

  return {
    data: usages,
    total,
    totalPages: Math.ceil(total / parsedLimit) || 1,
    currentPage: parsedPage,
  };
};
