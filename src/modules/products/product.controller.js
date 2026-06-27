import mongoose from "mongoose";
import { Product } from "./product.model.js";

// --- HELPER: VAT Calculation ---
const applyVat = (price, vat) => Number((price + (price * vat) / 100).toFixed(2));

// Handles both variant and non-variant products
const calculatePrices = (product) => {
  const vat = product.vatPercentage || 0;

  if (product.hasVariants && product.variants?.length > 0) {
    // Har variant pe VAT lagao
    const variantsWithPrices = product.variants.map((v) => ({
      ...v,
      prices: {
        excludeVat: { base: v.price, discount: v.discountPrice },
        includeVat: {
          base: applyVat(v.price, vat),
          discount: v.discountPrice ? applyVat(v.discountPrice, vat) : null,
        },
      },
    }));

    // Sabse kam price wala variant — listing page ke liye "starting from"
    const cheapest = variantsWithPrices.reduce((min, v) =>
      v.price < min.price ? v : min
    );

    return {
      ...product,
      variants: variantsWithPrices,
      startingFrom: {
        excludeVat: cheapest.prices.excludeVat.base,
        includeVat: cheapest.prices.includeVat.base,
      },
    };
  }

  // Non-variant product — current logic same
  const base = product.basePrice || 0;
  const discount = product.discountPrice || null;
  return {
    ...product,
    prices: {
      excludeVat: { base, discount },
      includeVat: {
        base: applyVat(base, vat),
        discount: discount ? applyVat(discount, vat) : null,
      },
    },
  };
};

// --- HELPER: Validate Variants ---
const validateVariants = (variants) => {
  if (!Array.isArray(variants) || variants.length === 0)
    return "At least one variant is required when hasVariants is true";

  for (const v of variants) {
    if (!v.label || String(v.label).trim().length === 0)
      return "Each variant must have a label";
    if (!v.price || Number(v.price) <= 0)
      return "Each variant must have a valid price greater than 0";
    if (v.discountPrice && Number(v.discountPrice) >= Number(v.price))
      return `Variant "${v.label}": discount price must be less than price`;
  }
  return null;
};

// 1. CREATE PRODUCT
export const createProduct = async (req, res) => {
  try {
    const { title, slug, basePrice, discountPrice, vatPercentage, images, hasVariants, variants } = req.body;

    if (!title || title.trim().length < 3) {
      return res.status(400).json({ success: false, message: "Product title must be at least 3 characters" });
    }

    if (hasVariants) {
      // Variant product validation
      const variantError = validateVariants(variants);
      if (variantError) return res.status(400).json({ success: false, message: variantError });
    } else {
      // Non-variant product validation
      if (!basePrice || basePrice <= 0)
        return res.status(400).json({ success: false, message: "Valid base price is required" });
      if (discountPrice && parseFloat(discountPrice) >= parseFloat(basePrice))
        return res.status(400).json({ success: false, message: "Discount price must be lower than base price" });
    }

    // Image Cleaning
    const cleanedImages = Array.isArray(images)
      ? images.filter((img) => img !== null && img !== "")
      : [];

    // Slug Duplicate Check
    const existingSlug = await Product.findOne({ slug });
    if (existingSlug)
      return res.status(400).json({ success: false, message: "Slug already exists" });

    const productData = {
      ...req.body,
      images: cleanedImages,
      vatPercentage: Number(vatPercentage) || 0,
      hasVariants: Boolean(hasVariants),
      variants: hasVariants ? variants : [],
      // Non-variant fields — null karo agar variant product hai
      basePrice: hasVariants ? null : Number(basePrice),
      discountPrice: hasVariants ? null : (discountPrice ? Number(discountPrice) : null),
      stock: hasVariants ? 0 : (req.body.stock || 0),
    };

    const product = new Product(productData);
    await product.save();

    res.status(201).json({ success: true, message: "Product created successfully!", data: product });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. GET ALL PRODUCTS (Fully Aligned with Category API Fields)
export const getProducts = async (req, res) => {
  try {
    const { search, category, status, sort, page = 1, limit = 10 } = req.query;
    let query = {};

    // Filters Setup
    if (status && status !== "All Products") {
      query.status = status === "Published" ? "Active" : "Draft";
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
      ];
    }
    if (category && category !== "All") query.category = category;

    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 10;
    const skip = (parsedPage - 1) * parsedLimit;

    // Sorting Logic Setup
    let sortOptions = {};
    if (sort === "price_asc") sortOptions.discountPrice = 1;
    else if (sort === "price_desc") sortOptions.discountPrice = -1;
    else sortOptions = sort ? sort.split(",").join(" ") : "-createdAt";

    // Fetch Products & Total Count Parallelly
    const [products, totalProducts] = await Promise.all([
      Product.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(parsedLimit)
        .populate("category", "name slug") // Populate name and slug dynamically
        .select("title slug sku basePrice discountPrice vatPercentage discountPercentage images status stock category createdAt hasVariants variants ratings")
        .lean(),
      Product.countDocuments(query),
    ]);

    // Data Transform with exact same Variant & VAT Logic
    const formattedData = products.map((product) => {
      const vatPercent = product.vatPercentage || 0;
      
      let baseExVat = 0;
      let discExVat = 0;
      let currentStock = 0;
      let formattedVariants = null;

      // Check if product has variants
      if (product.hasVariants && product.variants && product.variants.length > 0) {
        // A. Pure variants array map calculations
        formattedVariants = product.variants.map((v) => {
          const vBaseExVat = v.price || 0;
          const vDiscExVat = v.discountPrice || vBaseExVat;

          const vBaseIncVat = vBaseExVat * (1 + vatPercent / 100);
          const vDiscIncVat = vDiscExVat * (1 + vatPercent / 100);

          return {
            _id: v._id,
            label: v.label,
            price: v.price,
            discountPrice: v.discountPrice,
            stock: v.stock,
            sku: v.sku,
            prices: {
              excludeVat: {
                base: Number(vBaseExVat.toFixed(2)),
                discount: v.discountPrice ? Number(vDiscExVat.toFixed(2)) : null,
              },
              includeVat: {
                base: Number(vBaseIncVat.toFixed(2)),
                discount: v.discountPrice ? Number(vDiscIncVat.toFixed(2)) : null,
              }
            }
          };
        });

        // B. First variant data fallback
        const firstVariant = product.variants[0];
        baseExVat = firstVariant.price || 0;
        discExVat = firstVariant.discountPrice || baseExVat;
        currentStock = firstVariant.stock || 0;

      } else {
        // Non-variant calculations from main product fields
        baseExVat = product.basePrice || 0;
        discExVat = product.discountPrice || baseExVat;
        currentStock = product.stock || 0;
      }

      // Main product Level VAT Calculations
      const baseIncVat = baseExVat * (1 + vatPercent / 100);
      const discIncVat = discExVat * (1 + vatPercent / 100);

      return {
        _id: product._id,
        title: product.title,
        slug: product.slug,
        sku: product.sku,
        status: product.status, // Product management dashboard validation field
        hasVariants: product.hasVariants,
        stock: currentStock,
        prices: {
          excludeVat: {
            base: Number(baseExVat.toFixed(2)),
            discount: Number(discExVat.toFixed(2)),
          },
          includeVat: {
            base: Number(baseIncVat.toFixed(2)),
            discount: Number(discIncVat.toFixed(2)),
          }
        },
        // Variants array mapping injections conditionally
        ...(product.hasVariants && { variants: formattedVariants }),
        vatPercentage: vatPercent,
        discountPercentage: product.discountPercentage || "0% Off",
        ratings: product.ratings || { average: 0, count: 0 },
        category: product.category,
        thumbnail: product.images && product.images.length > 0 ? product.images[0].url : "",
        createdAt: product.createdAt,
      };
    });

    // Uniform response delivery format
    res.status(200).json({
      success: true,
      totalProducts,
      totalPages: Math.ceil(totalProducts / parsedLimit),
      currentPage: parsedPage,
      data: formattedData,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. GET SINGLE PRODUCT BY SLUG
export const getProductBySlug = async (req, res) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, status: "Active" })
      .populate("category")
      .lean();
    if (!product)
      return res.status(404).json({ success: false, message: "Product not found" });

    const data = calculatePrices(product);
    data.ratings = product.ratings || { average: 0, count: 0 };
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. GET SINGLE PRODUCT BY ID
export const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid ID" });

    const product = await Product.findById(id).populate("category").lean();
    if (!product)
      return res.status(404).json({ success: false, message: "Product not found" });

    res.status(200).json({ success: true, data: calculatePrices(product) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 5. UPDATE PRODUCT
export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const existingProduct = await Product.findById(id);
    if (!existingProduct)
      return res.status(404).json({ success: false, message: "Product not found" });

    const hasVariants = updateData.hasVariants !== undefined
      ? Boolean(updateData.hasVariants)
      : existingProduct.hasVariants;

    if (hasVariants) {
      const variantsToValidate = updateData.variants || existingProduct.variants;
      const variantError = validateVariants(variantsToValidate);
      if (variantError) return res.status(400).json({ success: false, message: variantError });

      // Variant product mein basePrice/discountPrice null karo
      updateData.basePrice = null;
      updateData.discountPrice = null;
      updateData.stock = 0;
      updateData.variants = variantsToValidate;
    } else {
      const basePrice = Number(updateData.basePrice || existingProduct.basePrice);
      let discountPrice = updateData.discountPrice !== undefined
        ? updateData.discountPrice === "" ? null : Number(updateData.discountPrice)
        : existingProduct.discountPrice;

      if (discountPrice !== null && discountPrice >= basePrice) {
        return res.status(400).json({ success: false, message: "Discount price must be less than base price" });
      }

      updateData.basePrice = basePrice;
      updateData.discountPrice = discountPrice;
      updateData.variants = []; // Non-variant product mein variants clear karo
    }

    updateData.hasVariants = hasVariants;

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("category")
      .lean();

    res.status(200).json({ success: true, data: calculatePrices(updatedProduct) });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 6. DELETE PRODUCT
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product)
      return res.status(404).json({ success: false, message: "Product not found" });
    res.status(200).json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 7. TOGGLE STATUS
export const toggleProductStatus = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product)
      return res.status(404).json({ success: false, message: "Product not found" });

    product.status = product.status === "Active" ? "Draft" : "Active";
    await product.save();
    res.status(200).json({
      success: true,
      message: `Status: ${product.status}`,
      data: { id: product._id, status: product.status },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 8. GET RELATED PRODUCTS (With Uniform VAT & Variant Logic)
export const getRelatedProducts = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select("category");
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const related = await Product.find({
      category: { $in: product.category },
      status: "Active",
      _id: { $ne: product._id },
    })
      .select("title slug sku basePrice discountPrice vatPercentage discountPercentage images status stock category createdAt hasVariants variants ratings")
      .populate("category", "name slug")
      .limit(8)
      .lean();

    const formattedRelated = related.map((p) => {
      const vatPercent = p.vatPercentage || 0;
      
      let baseExVat = 0;
      let discExVat = 0;
      let currentStock = 0;
      let formattedVariants = null;

      // Check if product has variants
      if (p.hasVariants && p.variants && p.variants.length > 0) {
        // A. Har ek variant object ke liye inner prices calculate karna
        formattedVariants = p.variants.map((v) => {
          const vBaseExVat = v.price || 0;
          const vDiscExVat = v.discountPrice || vBaseExVat;

          const vBaseIncVat = vBaseExVat * (1 + vatPercent / 100);
          const vDiscIncVat = vDiscExVat * (1 + vatPercent / 100);

          return {
            _id: v._id,
            label: v.label,
            price: v.price,
            discountPrice: v.discountPrice,
            stock: v.stock,
            sku: v.sku,
            prices: {
              excludeVat: {
                base: Number(vBaseExVat.toFixed(2)),
                discount: v.discountPrice ? Number(vDiscExVat.toFixed(2)) : null,
              },
              includeVat: {
                base: Number(vBaseIncVat.toFixed(2)),
                discount: v.discountPrice ? Number(vDiscIncVat.toFixed(2)) : null,
              }
            }
          };
        });

        // B. Main root node fields ke liye index 0 (First Variant) chunna
        const firstVariant = p.variants[0];
        baseExVat = firstVariant.price || 0;
        discExVat = firstVariant.discountPrice || baseExVat;
        currentStock = firstVariant.stock || 0;

      } else {
        // Agar variants nahi hain, toh primary product fields use hongi
        baseExVat = p.basePrice || 0;
        discExVat = p.discountPrice || baseExVat;
        currentStock = p.stock || 0;
      }

      // Root level calculations (ya toh first variant ki, ya normal product ki)
      const baseIncVat = baseExVat * (1 + vatPercent / 100);
      const discIncVat = discExVat * (1 + vatPercent / 100);

      return {
        _id: p._id,
        title: p.title,
        slug: p.slug,
        sku: p.sku,
        hasVariants: p.hasVariants,
        stock: currentStock, // Variant hone par first variant ka stock pass hoga
        prices: {
          excludeVat: {
            base: Number(baseExVat.toFixed(2)),
            discount: Number(discExVat.toFixed(2)),
          },
          includeVat: {
            base: Number(baseIncVat.toFixed(2)),
            discount: Number(discIncVat.toFixed(2)),
          }
        },
        // Agar variants true hain toh dynamically array payload inject hoga
        ...(p.hasVariants && { variants: formattedVariants }),
        vatPercentage: vatPercent,
        discountPercentage: p.discountPercentage,
        ratings: p.ratings || { average: 0, count: 0 },
        category: p.category,
        thumbnail: p.images && p.images.length > 0 ? p.images[0].url : "",
        createdAt: p.createdAt,
      };
    });

    res.status(200).json({ success: true, data: formattedRelated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 8b. GET PRODUCTS BY IDs
export const getProductsByIds = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "ids array is required" });
    }
    const products = await Product.find({ _id: { $in: ids }, status: "Active" })
      .select("title slug images basePrice discountPrice vatPercentage stock discountPercentage shipping_category hasVariants variants")
      .lean();
    const data = products.map((p) => calculatePrices(p));
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 9. FOR PRODUCT SELECTION (Dashboard Search)
export const getProductsForSelection = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    
    // String params ko Number mein secure parse karein
    const parsedPage = parseInt(page, 10) || 1;
    const parsedLimit = parseInt(limit, 10) || 10;

    let query = { status: "Active" };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
      ];
    }

    // Correct Skip skip logic calculation
    const skip = (parsedPage - 1) * parsedLimit;

    const products = await Product.find(query)
      .select("_id title slug images basePrice vatPercentage discountPrice hasVariants variants")
      .sort("-createdAt")
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    const formatted = products.map((p) => {
      const withPrices = calculatePrices(p);
      return {
        _id: p._id,
        title: p.title,
        slug: p.slug,
        thumbnail: p.images?.[0]?.url || null,
        hasVariants: p.hasVariants,
        ...(p.hasVariants
          ? { startingFrom: withPrices.startingFrom }
          : { prices: withPrices.prices }),
      };
    });

    // Total counts nikaalein aur exact totalPages calculate karein
    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / parsedLimit) || 1;

    // Response structure direct frontend components se integrated hai
    res.status(200).json({ 
      success: true, 
      totalProducts: total, 
      totalPages: totalPages, 
      currentPage: parsedPage,
      data: formatted 
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 10. SEARCH SUGGESTIONS
export const getSearchSuggestions = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(200).json({ success: true, data: [] });
    }

    const suggestions = await Product.find({
      status: "Active",
      $or: [
        { title: { $regex: q, $options: "i" } },
        { keywords: { $regex: q, $options: "i" } },
      ],
    })
      .select("title slug images")
      .limit(8)
      .lean();

    const formattedSuggestions = suggestions.map((p) => ({
      _id: p._id,
      title: p.title,
      slug: p.slug,
      thumbnail: p.images?.[0]?.url || null,
    }));

    res.status(200).json({ success: true, data: formattedSuggestions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 11. PUBLIC SEARCH — Results page (search + category filter + pagination)
export const searchProducts = async (req, res) => {
  try {
    const { q = "", category, sort = "-createdAt", page = 1, limit = 12 } = req.query;
    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 12;

    const query = { status: "Active" };

    if (q.trim().length > 0) {
      query.$or = [
        { title: { $regex: q.trim(), $options: "i" } },
        { keywords: { $regex: q.trim(), $options: "i" } },
        { sku: { $regex: q.trim(), $options: "i" } },
      ];
    }

    if (category) query.category = category;

    const skip = (parsedPage - 1) * parsedLimit;

    const sortMap = {
      newest: "-createdAt",
      oldest: "createdAt",
      price_asc: "basePrice",
      price_desc: "-basePrice",
    };
    const sortOption = sortMap[sort] || sort;

    const [products, total] = await Promise.all([
      Product.find(query)
        .select("title slug sku basePrice discountPrice vatPercentage discountPercentage images stock category createdAt hasVariants variants ratings")
        .populate("category", "name slug")
        .sort(sortOption)
        .skip(skip)
        .limit(parsedLimit)
        .lean(),
      Product.countDocuments(query),
    ]);

    const formatted = products.map((p) => {
      const vat = p.vatPercentage || 0;
      let prices, variants;

      if (p.hasVariants && p.variants?.length > 0) {
        const first = p.variants[0];
        const base = first.price || 0;
        const disc = first.discountPrice || null;
        prices = {
          excludeVat: { base, discount: disc },
          includeVat: {
            base: Number((base * (1 + vat / 100)).toFixed(2)),
            discount: disc ? Number((disc * (1 + vat / 100)).toFixed(2)) : null,
          },
        };
        variants = p.variants.map((v) => ({
          _id: v._id,
          label: v.label,
          price: v.price,
          discountPrice: v.discountPrice,
          stock: v.stock,
          sku: v.sku,
          prices: {
            excludeVat: { base: v.price, discount: v.discountPrice },
            includeVat: {
              base: Number((v.price * (1 + vat / 100)).toFixed(2)),
              discount: v.discountPrice ? Number((v.discountPrice * (1 + vat / 100)).toFixed(2)) : null,
            },
          },
        }));
      } else {
        const base = p.basePrice || 0;
        const disc = p.discountPrice || null;
        prices = {
          excludeVat: { base, discount: disc },
          includeVat: {
            base: Number((base * (1 + vat / 100)).toFixed(2)),
            discount: disc ? Number((disc * (1 + vat / 100)).toFixed(2)) : null,
          },
        };
      }

      return {
        _id: p._id,
        title: p.title,
        slug: p.slug,
        sku: p.sku,
        hasVariants: p.hasVariants,
        stock: p.hasVariants ? (p.variants[0]?.stock || 0) : (p.stock || 0),
        prices,
        ...(p.hasVariants && { variants }),
        vatPercentage: vat,
        discountPercentage: p.discountPercentage,
        ratings: p.ratings || { average: 0, count: 0 },
        category: p.category,
        thumbnail: p.images?.[0]?.url || "",
        createdAt: p.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      query: q,
      totalProducts: total,
      totalPages: Math.ceil(total / parsedLimit),
      currentPage: parsedPage,
      data: formatted,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 12. EXPORT PRODUCTS — CSV or Excel
export const exportProducts = async (req, res) => {
  try {
    const { min = 1, max, format = "csv" } = req.query;

    const parsedMin = Math.max(1, parseInt(min) || 1);
    const total     = await Product.countDocuments();
    const parsedMax = Math.min(total, parseInt(max) || total);

    if (parsedMin > parsedMax)
      return res.status(400).json({ success: false, message: `min (${parsedMin}) cannot be greater than max (${parsedMax})` });

    const skip  = parsedMin - 1;
    const limit = parsedMax - parsedMin + 1;

    const products = await Product.find()
      .select("title slug sku basePrice discountPrice vatPercentage stock status brand category hasVariants variants createdAt")
      .populate("category", "name")
      .sort("-createdAt")
      .skip(skip)
      .limit(limit)
      .lean();

    // ── Build flat rows (expand variants as separate rows) ──────────────────
    const rows = [];
    for (const p of products) {
      const categories = p.category?.map((c) => c.name).join(" | ") || "";
      const base = {
        Title:       p.title,
        Slug:        p.slug,
        SKU:         p.sku,
        Brand:       p.brand || "",
        Status:      p.status,
        Categories:  categories,
        "Has Variants": p.hasVariants ? "Yes" : "No",
        "VAT %":     p.vatPercentage ?? 0,
        "Created At": new Date(p.createdAt).toLocaleDateString("en-GB"),
      };

      if (p.hasVariants && p.variants?.length > 0) {
        for (const v of p.variants) {
          rows.push({
            ...base,
            "Variant Label":    v.label || "",
            "Variant SKU":      v.sku || "",
            "Base Price (ex VAT)": v.price ?? "",
            "Discount Price (ex VAT)": v.discountPrice ?? "",
            Stock: v.stock ?? 0,
          });
        }
      } else {
        rows.push({
          ...base,
          "Variant Label":    "",
          "Variant SKU":      "",
          "Base Price (ex VAT)": p.basePrice ?? "",
          "Discount Price (ex VAT)": p.discountPrice ?? "",
          Stock: p.stock ?? 0,
        });
      }
    }

    const headers = Object.keys(rows[0] || {});
    const filename = `products_${parsedMin}-${parsedMax}_${Date.now()}`;

    // ── CSV ─────────────────────────────────────────────────────────────────
    if (format === "csv") {
      const escape = (v) => {
        const str = String(v ?? "").replace(/"/g, '""');
        return /[,"\n]/.test(str) ? `"${str}"` : str;
      };
      const csvLines = [
        headers.map(escape).join(","),
        ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
      ];
      const csv = csvLines.join("\r\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
      return res.send(csv);
    }

    // ── Excel (XLSX) — built with raw XML, no extra deps ────────────────────
    if (format === "excel") {
      const escXml = (v) =>
        String(v ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

      const colLetter = (i) => {
        let s = "";
        let n = i + 1;
        while (n > 0) {
          s = String.fromCharCode(((n - 1) % 26) + 65) + s;
          n = Math.floor((n - 1) / 26);
        }
        return s;
      };

      const sheetRows = [headers, ...rows.map((r) => headers.map((h) => r[h]))];
      const xmlRows = sheetRows
        .map((row, ri) => {
          const cells = row
            .map((cell, ci) => {
              const ref = `${colLetter(ci)}${ri + 1}`;
              const num = !isNaN(cell) && cell !== "" && cell !== null;
              return num
                ? `<c r="${ref}" t="n"><v>${cell}</v></c>`
                : `<c r="${ref}" t="inlineStr"><is><t>${escXml(cell)}</t></is></c>`;
            })
            .join("");
          return `<row r="${ri + 1}">${cells}</row>`;
        })
        .join("");

      const sharedXlsx = [
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ];

      // Minimal XLSX = ZIP of 5 XML files. We build it manually using Buffer concat.
      // Instead, stream as SpreadsheetML (Excel-compatible XML) — opens natively in Excel.
      const xlsXml = [
        `<?xml version="1.0"?>`,
        `<?mso-application progid="Excel.Sheet"?>`,
        `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"`,
        ` xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`,
        `<Worksheet ss:Name="Products"><Table>`,
        sheetRows
          .map(
            (row) =>
              `<Row>${row
                .map((cell) => {
                  const num = !isNaN(cell) && cell !== "" && cell !== null;
              return `<Cell><Data ss:Type="${num ? "Number" : "String"}">${escXml(cell)}</Data></Cell>`;
                })
                .join("")}</Row>`,
          )
          .join(""),
        `</Table></Worksheet></Workbook>`,
      ].join("");

      res.setHeader("Content-Type", "application/vnd.ms-excel");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.xls"`);
      return res.send(xlsXml);
    }

    return res.status(400).json({ success: false, message: 'format must be "csv" or "excel"' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getReviewProductDetails = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ success: false, message: "Invalid product ID" });

    const product = await Product.findById(id)
      .select("title slug images basePrice discountPrice vatPercentage sku status")
      .lean();

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: "Product not found" 
      });
    }


    // 3. Simple Response Format
    const responseData = {
      _id: product._id,
      title: product.title,
      slug: product.slug,
      sku: product.sku,
      images: {
        url: product.images?.[0]?.url || null,
        alt: product.images?.[0]?.alt || product.title
      },
      status: product.status
    };

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};