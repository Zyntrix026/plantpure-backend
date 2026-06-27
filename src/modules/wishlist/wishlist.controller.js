import { Wishlist } from "./wishlist.model.js";
import { Product } from "../products/product.model.js";

const formatProduct = (p, variantId = null) => {
  const vat = p.vatPercentage || 0;

  if (p.hasVariants && variantId) {
    const variant = p.variants?.find((v) => v._id.toString() === variantId.toString());
    if (variant) {
      const base = variant.price;
      const discount = variant.discountPrice || null;
      return {
        _id: p._id,
        title: p.title,
        slug: p.slug,
        thumbnail: p.images?.[0]?.url || null,
        stock: variant.stock ?? 0,
        sku: variant.sku || p.sku,
        brand: p.brand,
        shipping_category: p.shipping_category ?? "SP",
        discountPercentage: p.discountPercentage || null,
        vatPercentage: vat,
        hasVariants: true,
        variantId: variant._id,
        variantLabel: variant.label,
        category: p.category || [],
        prices: {
          excludeVat: { base, discount },
          includeVat: {
            base: Number((base + (base * vat) / 100).toFixed(2)),
            discount: discount ? Number((discount + (discount * vat) / 100).toFixed(2)) : null,
          },
        },
      };
    }
  }

  const base = p.basePrice || 0;
  const discount = p.discountPrice || null;
  return {
    _id: p._id,
    title: p.title,
    slug: p.slug,
    thumbnail: p.images?.[0]?.url || null,
    stock: p.stock ?? 0,
    sku: p.sku,
    brand: p.brand,
    shipping_category: p.shipping_category ?? "SP",
    discountPercentage: p.discountPercentage || null,
    vatPercentage: vat,
    hasVariants: p.hasVariants || false,
    category: p.category || [],
    prices: {
      excludeVat: { base, discount },
      includeVat: {
        base: Number((base + (base * vat) / 100).toFixed(2)),
        discount: discount ? Number((discount + (discount * vat) / 100).toFixed(2)) : null,
      },
    },
  };
};

// ─── GET /wishlist ────────────────────────────────────────────────────────────
export const getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user.userId })
      .populate({
        path: "items.productId",
        select: "title slug images basePrice discountPrice vatPercentage stock discountPercentage shipping_category status hasVariants variants sku brand category",
        populate: { path: "category", select: "_id name slug" },
      })
      .lean();

    if (!wishlist || wishlist.items.length === 0) {
      return res.status(200).json({ success: true, items: [], total: 0 });
    }

    const items = wishlist.items
      .filter((i) => i.productId && i.productId.status === "Active")
      .map((i) => ({
        _id: i._id,
        variantId: i.variantId || null,
        addedAt: i.addedAt,
        product: formatProduct(i.productId, i.variantId),
      }));

    res.status(200).json({ success: true, items, total: items.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── POST /wishlist/toggle/:productId ────────────────────────────────────────
export const toggleWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const { variantId = null } = req.body;
    const userId = req.user.userId;

    const product = await Product.findById(productId).select("_id status hasVariants variants");
    if (!product || product.status !== "Active") {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Validate variantId if provided
    if (variantId && product.hasVariants) {
      const variantExists = product.variants?.some((v) => v._id.toString() === variantId.toString());
      if (!variantExists) {
        return res.status(400).json({ success: false, message: "Variant not found" });
      }
    }

    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) wishlist = new Wishlist({ userId, items: [] });

    // Match by productId + variantId (null variantId = non-variant product)
    const existingIndex = wishlist.items.findIndex((i) => {
      const pMatch = i.productId.toString() === productId;
      const vMatch = (i.variantId?.toString() || null) === (variantId?.toString() || null);
      return pMatch && vMatch;
    });

    let wishlisted;
    if (existingIndex > -1) {
      wishlist.items.splice(existingIndex, 1);
      wishlisted = false;
    } else {
      wishlist.items.push({ productId, variantId: variantId || null });
      wishlisted = true;
    }

    await wishlist.save();

    res.status(200).json({
      success: true,
      wishlisted,
      message: wishlisted ? "Added to wishlist" : "Removed from wishlist",
      total: wishlist.items.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── DELETE /wishlist/clear ───────────────────────────────────────────────────
export const clearWishlist = async (req, res) => {
  try {
    await Wishlist.findOneAndUpdate(
      { userId: req.user.userId },
      { $set: { items: [] } }
    );
    res.status(200).json({ success: true, message: "Wishlist cleared" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── POST /wishlist/merge ─────────────────────────────────────────────────────
export const mergeWishlist = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { items: guestItems } = req.body;

    // Support both old format { productIds: [] } and new format { items: [{ productId, variantId }] }
    let itemsToMerge = [];
    if (Array.isArray(guestItems)) {
      itemsToMerge = guestItems;
    } else if (Array.isArray(req.body.productIds)) {
      itemsToMerge = req.body.productIds.map((id) => ({ productId: id, variantId: null }));
    }

    if (itemsToMerge.length === 0) {
      return res.status(400).json({ success: false, message: "items array is required" });
    }

    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) wishlist = new Wishlist({ userId, items: [] });

    for (const entry of itemsToMerge) {
      const productId = entry.productId || entry;
      const variantId = entry.variantId || null;

      const product = await Product.findById(productId).select("_id status hasVariants variants");
      if (!product || product.status !== "Active") continue;

      if (variantId && product.hasVariants) {
        const variantExists = product.variants?.some((v) => v._id.toString() === variantId.toString());
        if (!variantExists) continue;
      }

      const exists = wishlist.items.some((i) => {
        const pMatch = i.productId.toString() === productId.toString();
        const vMatch = (i.variantId?.toString() || null) === (variantId?.toString() || null);
        return pMatch && vMatch;
      });

      if (!exists) wishlist.items.push({ productId, variantId: variantId || null });
    }

    await wishlist.save();
    res.status(200).json({ success: true, message: "Wishlist merged", total: wishlist.items.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── GET /wishlist/check/:productId ──────────────────────────────────────────
export const checkWishlisted = async (req, res) => {
  try {
    const { variantId = null } = req.query;
    const wishlist = await Wishlist.findOne({ userId: req.user.userId }).lean();
    const wishlisted = wishlist?.items.some((i) => {
      const pMatch = i.productId.toString() === req.params.productId;
      const vMatch = (i.variantId?.toString() || null) === (variantId?.toString() || null);
      return pMatch && vMatch;
    }) ?? false;

    res.status(200).json({ success: true, wishlisted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
