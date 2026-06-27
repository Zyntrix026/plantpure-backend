import mongoose from "mongoose";
import { Coupon } from "./coupon.model.js";
import { CouponUsage } from "./couponUsage.model.js";
import { Cart } from "../cart/cart.model.js";
import { Product } from "../products/product.model.js";
import {
  validateCouponService,
  getAllCouponsService,
  getCouponUsageService,
} from "./coupon.service.js";

// ─── Helper: Build cartItems array from DB cart for validation ────────────────
const buildCartItemsForValidation = async (userId) => {
  const cart = await Cart.findOne({ userId })
    .populate({
      path: "items.productId",
      select: "category",
    })
    .lean();

  if (!cart || cart.items.length === 0) {
    throw Object.assign(new Error("Your cart is empty"), { statusCode: 400 });
  }

  let cartTotal = 0;
  const cartItems = cart.items.map((item) => {
    const price = item.discountPrice ?? item.basePrice;
    cartTotal += price * item.quantity;
    return {
      productId: item.productId._id || item.productId,
      basePrice: item.basePrice,
      discountPrice: item.discountPrice ?? null,
      quantity: item.quantity,
      // category IDs array for category_specific check
      categories: item.productId?.category || [],
    };
  });

  return { cartItems, cartTotal: Number(cartTotal.toFixed(2)) };
};

// ─── 1. USER: Validate / Apply Coupon ────────────────────────────────────────
// POST /api/coupons/validate
export const validateCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user?.userId ?? null;
    const isGuest = !userId;

    if (!code) {
      return res.status(400).json({ success: false, message: "Coupon code is required" });
    }

    // Build cart items from DB (registered user)
    // Guest users cannot validate from cart — they pass items in body
    let cartItems, cartTotal;

    if (!isGuest) {
      const built = await buildCartItemsForValidation(userId);
      cartItems = built.cartItems;
      cartTotal = built.cartTotal;
    } else {
      // Guest: items must be passed in body
      const { items } = req.body;
      if (!items || items.length === 0) {
        return res.status(400).json({ success: false, message: "Cart items are required for guest validation" });
      }
      const productIds = items.map((i) => i.productId);
      const products = await Product.find({ _id: { $in: productIds } })
        .select("category basePrice discountPrice vatPercentage hasVariants variants")
        .lean();
      const productMap = {};
      products.forEach((p) => (productMap[p._id.toString()] = p));

      cartTotal = 0;
      cartItems = items.map((item) => {
        const product = productMap[item.productId?.toString()];
        let price = 0;
        if (product?.hasVariants && item.variantId) {
          const variant = product.variants?.find((v) => v._id.toString() === item.variantId.toString());
          price = variant?.discountPrice ?? variant?.price ?? 0;
        } else {
          price = product?.discountPrice ?? product?.basePrice ?? 0;
        }
        cartTotal += price * item.quantity;
        return {
          productId: item.productId,
          basePrice: price,
          discountPrice: null,
          quantity: item.quantity,
          categories: product?.category || [],
        };
      });
      cartTotal = Number(cartTotal.toFixed(2));
    }

    const result = await validateCouponService({
      code,
      userId,
      cartItems,
      cartTotal,
      isGuest,
    });

    res.status(200).json({
      success: true,
      message: "Coupon applied successfully",
      data: {
        code: result.coupon.code,
        description: result.coupon.description,
        type: result.coupon.type,
        discountAmount: result.discountAmount,
        isFreeShipping: result.isFreeShipping,
        cartTotal,
        finalTotal: result.finalTotal,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── 2. ADMIN: Create Coupon ──────────────────────────────────────────────────
// POST /api/coupons/admin/create
export const createCoupon = async (req, res) => {
  try {
    const {
      code, description, type, value, maxDiscount, minOrderAmount,
      applicableProducts, applicableCategories, allowedUsers,
      startDate, expiryDate, usageLimit, perUserLimit,
    } = req.body;

    if (!code || !type || !expiryDate) {
      return res.status(400).json({ success: false, message: "code, type and expiryDate are required" });
    }

    // free_shipping ke liye value 0 allowed
    if (type !== "free_shipping" && (!value || value <= 0)) {
      return res.status(400).json({ success: false, message: "value must be greater than 0" });
    }

    if (type === "percentage" && value > 100) {
      return res.status(400).json({ success: false, message: "Percentage value cannot exceed 100" });
    }

    const expiry = new Date(expiryDate);
    if (isNaN(expiry.getTime()) || expiry <= new Date()) {
      return res.status(400).json({ success: false, message: "expiryDate must be a valid future date" });
    }

    const coupon = await Coupon.create({
      code: code.trim().toUpperCase(),
      description: description || "",
      type,
      value: type === "free_shipping" ? 0 : Number(value),
      maxDiscount: maxDiscount ? Number(maxDiscount) : null,
      minOrderAmount: minOrderAmount ? Number(minOrderAmount) : 0,
      applicableProducts: applicableProducts || [],
      applicableCategories: applicableCategories || [],
      allowedUsers: allowedUsers || [],
      startDate: startDate ? new Date(startDate) : new Date(),
      expiryDate: expiry,
      usageLimit: usageLimit ? Number(usageLimit) : null,
      perUserLimit: perUserLimit ? Number(perUserLimit) : 1,
    });

    res.status(201).json({ success: true, message: "Coupon created successfully", data: coupon });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Coupon code already exists" });
    }
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── 3. ADMIN: Get All Coupons ────────────────────────────────────────────────
// GET /api/coupons/admin/all
export const getAllCoupons = async (req, res) => {
  try {
    const { search, status, type, page = 1, limit = 10 } = req.query;
    const result = await getAllCouponsService({ search, status, type, page, limit });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 4. ADMIN: Get Single Coupon ──────────────────────────────────────────────
// GET /api/coupons/admin/:id
export const getCouponById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid coupon ID" });
    }
    const coupon = await Coupon.findById(req.params.id)
      .populate("applicableProducts", "title sku")
      .populate("applicableCategories", "name slug")
      .populate("allowedUsers", "name email")
      .lean();

    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    res.status(200).json({ success: true, data: coupon });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 5. ADMIN: Update Coupon ──────────────────────────────────────────────────
// PATCH /api/coupons/admin/:id
export const updateCoupon = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid coupon ID" });
    }

    // usageCount aur totalDiscountGiven update nahi hone chahiye manually
    const { usageCount, totalDiscountGiven, ...updateData } = req.body;

    if (updateData.code) updateData.code = updateData.code.trim().toUpperCase();
    if (updateData.expiryDate) {
      const expiry = new Date(updateData.expiryDate);
      if (isNaN(expiry.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid expiryDate" });
      }
      updateData.expiryDate = expiry;
    }

    const coupon = await Coupon.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });
    res.status(200).json({ success: true, message: "Coupon updated successfully", data: coupon });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "Coupon code already exists" });
    }
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── 6. ADMIN: Toggle Active/Inactive ────────────────────────────────────────
// PATCH /api/coupons/admin/:id/toggle
export const toggleCouponStatus = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid coupon ID" });
    }
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    res.status(200).json({
      success: true,
      message: `Coupon ${coupon.isActive ? "activated" : "deactivated"} successfully`,
      data: { _id: coupon._id, code: coupon.code, isActive: coupon.isActive },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 7. ADMIN: Delete Coupon ──────────────────────────────────────────────────
// DELETE /api/coupons/admin/:id
export const deleteCoupon = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid coupon ID" });
    }
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found" });

    // Usage records bhi delete karo
    await CouponUsage.deleteMany({ couponId: req.params.id });

    res.status(200).json({ success: true, message: "Coupon deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 8. ADMIN: Get Coupon Usage History ──────────────────────────────────────
// GET /api/coupons/admin/:id/usage
export const getCouponUsage = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid coupon ID" });
    }
    const result = await getCouponUsageService(req.params.id, req.query);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── 9. ADMIN: Analytics Summary ─────────────────────────────────────────────
// GET /api/coupons/admin/analytics
export const getCouponAnalytics = async (req, res) => {
  try {
    const [
      totalCoupons,
      activeCoupons,
      expiredCoupons,
      topCoupons,
      totalDiscountStats,
    ] = await Promise.all([
      Coupon.countDocuments(),
      Coupon.countDocuments({ isActive: true, expiryDate: { $gte: new Date() } }),
      Coupon.countDocuments({ expiryDate: { $lt: new Date() } }),
      // Top 5 most used coupons
      Coupon.find()
        .select("code type usageCount totalDiscountGiven")
        .sort("-usageCount")
        .limit(5)
        .lean(),
      // Total discount given across all coupons
      Coupon.aggregate([
        { $group: { _id: null, totalDiscount: { $sum: "$totalDiscountGiven" }, totalUses: { $sum: "$usageCount" } } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalCoupons,
        activeCoupons,
        expiredCoupons,
        totalDiscountGiven: totalDiscountStats[0]?.totalDiscount || 0,
        totalCouponUses: totalDiscountStats[0]?.totalUses || 0,
        topCoupons,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
