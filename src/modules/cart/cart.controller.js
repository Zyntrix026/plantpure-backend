import { Cart } from "./cart.model.js";
import { Product } from "../products/product.model.js";

// --- HELPER: Unique key per cart line item ---
// Simple product  → "productId"
// Variant product → "productId_variantId"
const itemKey = (productId, variantId) =>
  variantId ? `${productId}_${variantId}` : `${productId}`;
const sameItem = (cartItem, productId, variantId) => {
  const pMatch = cartItem.productId.toString() === productId.toString();
  if (!variantId) return pMatch && !cartItem.variantId;
  return pMatch && cartItem.variantId?.toString() === variantId.toString();
};

// --- HELPER: Recalculate totals ---
const updateCartTotals = (cart) => {
  const totals = cart.items.reduce(
    (acc, item) => {
      const price = item.discountPrice ?? item.basePrice;
      const savings = (item.basePrice - (item.discountPrice ?? item.basePrice)) * item.quantity;
      acc.totalPrice += price * item.quantity;
      acc.totalSavings += savings > 0 ? savings : 0;
      return acc;
    },
    { totalPrice: 0, totalSavings: 0 }
  );
  cart.totalPrice = Math.round(totals.totalPrice * 100) / 100;
  cart.totalSavings = Math.round(totals.totalSavings * 100) / 100;
};

// --- HELPER: Build a cart item from product + optional variant ---
const buildCartItem = (product, variantId, quantity) => {
  if (product.hasVariants && variantId) {
    const variant = product.variants.find(
      (v) => v._id.toString() === variantId.toString()
    );
    if (!variant) return null;
    if (variant.stock < 1) return null;

    return {
      productId: product._id,
      variantId: variant._id,
      variantLabel: variant.label,
      name: `${product.title} — ${variant.label}`,
      image: product.images?.[0]?.url || "",
      basePrice: variant.price,
      discountPrice: variant.discountPrice ?? null,
      discountPercentage: null,
      shipping_category: product.shipping_category ?? "SP",
      vatPercentage: product.vatPercentage ?? 0,
      quantity,
    };
  }

  // Simple product
  return {
    productId: product._id,
    variantId: null,
    variantLabel: null,
    name: product.title,
    image: product.images?.[0]?.url || "",
    basePrice: product.basePrice,
    discountPrice: product.discountPrice ?? null,
    discountPercentage: product.discountPercentage ?? null,
    shipping_category: product.shipping_category ?? "SP",
    vatPercentage: product.vatPercentage ?? 0,
    quantity,
  };
};

// --- HELPER: Get available stock for a product/variant ---
const getStock = (product, variantId) => {
  if (product.hasVariants && variantId) {
    const variant = product.variants.find(
      (v) => v._id.toString() === variantId.toString()
    );
    return variant?.stock ?? 0;
  }
  return product.stock ?? 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. ADD TO CART
// ─────────────────────────────────────────────────────────────────────────────
export const addToCart = async (req, res) => {
  const { items } = req.body;
  const userId = req.user.userId;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "items array is required" });
  }

  try {
    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [], totalPrice: 0, totalSavings: 0 });

    for (const item of items) {
      const { productId, variantId = null, quantity = 1 } = item;
      if (!productId || quantity < 1) continue;

      const product = await Product.findById(productId);
      if (!product) continue;

      // Variant product must have variantId
      if (product.hasVariants && !variantId) continue;

      const stock = getStock(product, variantId);
      const idx = cart.items.findIndex((ci) => sameItem(ci, productId, variantId));

      if (idx > -1) {
        const newQty = cart.items[idx].quantity + quantity;
        if (newQty > stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${stock} units available${cart.items[idx].variantLabel ? ` for ${cart.items[idx].variantLabel}` : ""}`,
          });
        }
        cart.items[idx].quantity = newQty;
        // Refresh prices in case they changed
        if (product.hasVariants && variantId) {
          const variant = product.variants.find((v) => v._id.toString() === variantId.toString());
          if (variant) {
            cart.items[idx].basePrice = variant.price;
            cart.items[idx].discountPrice = variant.discountPrice ?? null;
          }
        } else {
          cart.items[idx].basePrice = product.basePrice;
          cart.items[idx].discountPrice = product.discountPrice ?? null;
        }
      } else {
        const newItem = buildCartItem(product, variantId, quantity);
        if (!newItem) continue;
        if (quantity > stock) {
          return res.status(400).json({
            success: false,
            message: `Only ${stock} units available`,
          });
        }
        cart.items.push(newItem);
      }
    }

    updateCartTotals(cart);
    await cart.save();
    return res.status(200).json({ success: true, cart });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. DECREASE QUANTITY BY 1 (or remove if qty = 1)
// Route: DELETE /cart/remove/:productId?variantId=xxx
// ─────────────────────────────────────────────────────────────────────────────
export const removeProduct = async (req, res) => {
  const { productId } = req.params;
  const variantId = req.query.variantId || null;
  const userId = req.user.userId;

  try {
    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

    const idx = cart.items.findIndex((i) => sameItem(i, productId, variantId));
    if (idx === -1) return res.status(404).json({ success: false, message: "Item not in cart" });

    if (cart.items[idx].quantity > 1) {
      cart.items[idx].quantity -= 1;
    } else {
      cart.items.splice(idx, 1);
    }

    updateCartTotals(cart);
    await cart.save();
    res.status(200).json({ success: true, cart });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. REMOVE ITEM COMPLETELY
// Route: DELETE /cart/remove/:productId/all?variantId=xxx
// ─────────────────────────────────────────────────────────────────────────────
export const removeItemCompletely = async (req, res) => {
  const { productId } = req.params;
  const variantId = req.query.variantId || null;
  const userId = req.user.userId;

  try {
    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

    cart.items = cart.items.filter((i) => !sameItem(i, productId, variantId));

    updateCartTotals(cart);
    await cart.save();
    res.status(200).json({ success: true, cart });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET CART
// ─────────────────────────────────────────────────────────────────────────────
export const getCart = async (req, res) => {
  const userId = req.user.userId;
  try {
    const cart = await Cart.findOne({ userId })
      .populate({
        path: "items.productId",
        select: "slug category vatPercentage basePrice discountPrice stock shipping_category hasVariants variants",
        populate: { path: "category", select: "_id name slug" },
      })
      .lean();

    if (!cart || cart.items.length === 0) {
      return res.status(200).json({
        success: true,
        cart: { items: [], totalPrice: 0, totalSavings: 0 },
      });
    }

    const optimizedItems = cart.items.map((item) => {
      const product = item.productId;
      const vatPercent = item.vatPercentage ?? product?.vatPercentage ?? 0;

      // Use prices stored in cart item (snapshot at time of add)
      const baseExVat = item.basePrice || 0;
      const discExVat = item.discountPrice ?? baseExVat;

      const baseIncVat = Number((baseExVat * (1 + vatPercent / 100)).toFixed(2));
      const discIncVat = Number((discExVat * (1 + vatPercent / 100)).toFixed(2));

      // Live stock — variant or product level
      let liveStock = product?.stock ?? 0;
      if (product?.hasVariants && item.variantId) {
        const liveVariant = product.variants?.find(
          (v) => v._id.toString() === item.variantId.toString()
        );
        liveStock = liveVariant?.stock ?? 0;
      }

      return {
        _id: item._id,
        productId: product?._id,
        variantId: item.variantId || null,
        variantLabel: item.variantLabel || null,
        slug: product?.slug,
        name: item.name,
        image: item.image,
        quantity: item.quantity,
        stock: liveStock,
        shipping_category: product?.shipping_category ?? item.shipping_category ?? "SP",
        discountPercentage: item.discountPercentage,
        vatPercentage: vatPercent,
        prices: {
          excludeVat: {
            base: Number(baseExVat.toFixed(2)),
            discount: Number(discExVat.toFixed(2)),
          },
          includeVat: {
            base: baseIncVat,
            discount: discIncVat,
          },
        },
        category: product?.category || [],
      };
    });

    res.status(200).json({
      success: true,
      cart: {
        _id: cart._id,
        items: optimizedItems,
        totalPrice: cart.totalPrice,
        totalSavings: cart.totalSavings,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. UPDATE ITEM QUANTITY (set exact qty)
// Route: PATCH /cart/update/:productId?variantId=xxx
// ─────────────────────────────────────────────────────────────────────────────
export const updateItemQuantity = async (req, res) => {
  const { productId } = req.params;
  const variantId = req.query.variantId || null;
  const { quantity } = req.body;
  const userId = req.user.userId;

  if (!quantity || quantity < 1) {
    return res.status(400).json({ success: false, message: "quantity must be >= 1" });
  }

  try {
    const cart = await Cart.findOne({ userId });
    if (!cart) return res.status(404).json({ success: false, message: "Cart not found" });

    const item = cart.items.find((i) => sameItem(i, productId, variantId));
    if (!item) return res.status(404).json({ success: false, message: "Item not in cart" });

    // Stock check
    const product = await Product.findById(productId);
    if (product) {
      const stock = getStock(product, variantId);
      if (quantity > stock) {
        return res.status(400).json({ success: false, message: `Only ${stock} units available` });
      }
    }

    item.quantity = quantity;
    updateCartTotals(cart);
    await cart.save();
    res.status(200).json({ success: true, cart });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. CLEAR CART
// ─────────────────────────────────────────────────────────────────────────────
export const clearCart = async (req, res) => {
  const userId = req.user.userId;
  try {
    const cart = await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [], totalPrice: 0, totalSavings: 0 } },
      { new: true }
    );
    res.status(200).json({ success: true, message: "Cart cleared", cart });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. MERGE GUEST CART → User Cart (after login/signup)
// Guest cart items can have variantId + variantLabel
// ─────────────────────────────────────────────────────────────────────────────
export const mergeCart = async (req, res) => {
  const userId = req.user.userId;
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: "items array is required" });
  }

  try {
    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [], totalPrice: 0, totalSavings: 0 });

    for (const guestItem of items) {
      const { productId, variantId = null, quantity = 1 } = guestItem;
      if (!productId || quantity < 1) continue;

      const product = await Product.findById(productId);
      if (!product) continue;

      // Variant product must have variantId
      if (product.hasVariants && !variantId) continue;

      const stock = getStock(product, variantId);
      const idx = cart.items.findIndex((ci) => sameItem(ci, productId, variantId));

      if (idx > -1) {
        // Merge: add quantities but cap at stock
        cart.items[idx].quantity = Math.min(cart.items[idx].quantity + quantity, stock);
        // Refresh prices
        if (product.hasVariants && variantId) {
          const variant = product.variants.find((v) => v._id.toString() === variantId.toString());
          if (variant) {
            cart.items[idx].basePrice = variant.price;
            cart.items[idx].discountPrice = variant.discountPrice ?? null;
            cart.items[idx].variantLabel = variant.label;
          }
        } else {
          cart.items[idx].basePrice = product.basePrice;
          cart.items[idx].discountPrice = product.discountPrice ?? null;
        }
      } else {
        const cappedQty = Math.min(quantity, stock);
        if (cappedQty < 1) continue;
        const newItem = buildCartItem(product, variantId, cappedQty);
        if (!newItem) continue;
        cart.items.push(newItem);
      }
    }

    updateCartTotals(cart);
    await cart.save();
    res.status(200).json({ success: true, cart });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
