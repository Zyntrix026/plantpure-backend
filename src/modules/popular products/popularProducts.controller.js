import { PopularProducts } from "./popularProducts.model.js";
// import { Product } from "../products/product.model.js";

// 1. SAVE OR UPDATE POPULAR PRODUCTS (Admin Only)
export const saveOrUpdatePopularProducts = async (req, res) => {
  try {
    const { title, products, isActive } = req.body;

    // Validation: Kam se kam ek product hona chahiye
    if (products && products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one product for the Popular section.",
      });
    }

    // Upsert logic: Ek hi document maintain hoga
    const popularSection = await PopularProducts.findOneAndUpdate(
      {}, // Empty filter: matches the first document found
      { title, products, isActive },
      {
        new: true,
        upsert: true, // Agar document nahi hai toh naya banao
        runValidators: true,
      }
    );

    res.status(200).json({
      success: true,
      message: "Popular Products updated successfully!",
      data: popularSection,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 2. GET POPULAR PRODUCTS FOR PUBLIC WEBSITE (With VAT & Variant Logic)
export const getPublicPopularProducts = async (req, res) => {
  try {
    const popularData = await PopularProducts.findOne({ isActive: true })
      .populate({
        path: "products",
        select: "title slug basePrice discountPrice images stock status vatPercentage discountPercentage sku hasVariants variants ratings category",
        match: { status: "Active" },
        populate: { path: "category", select: "name slug" },
      })
      .lean();

    if (!popularData) {
      return res.status(404).json({
        success: false,
        message: "No popular products found.",
      });
    }

    // Target mapping strategy array for active components
    const formattedProducts = (popularData.products || []).map((product) => {
      const vatPercent = product.vatPercentage || 0;
      
      let baseExVat = 0;
      let discExVat = 0;
      let currentStock = 0;
      let formattedVariants = null;

      // Structural handling execution loop
      if (product.hasVariants && product.variants && product.variants.length > 0) {
        
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

        const firstVariant = product.variants[0];
        baseExVat = firstVariant.price || 0;
        discExVat = firstVariant.discountPrice || baseExVat;
        currentStock = firstVariant.stock || 0;

      } else {
        baseExVat = product.basePrice || 0;
        discExVat = product.discountPrice || baseExVat;
        currentStock = product.stock || 0;
      }

      const baseIncVat = baseExVat * (1 + vatPercent / 100);
      const discIncVat = discExVat * (1 + vatPercent / 100);

      return {
        _id: product._id,
        title: product.title,
        slug: product.slug,
        sku: product.sku,
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
        ...(product.hasVariants && { variants: formattedVariants }),
        vatPercentage: vatPercent,
        discountPercentage: product.discountPercentage,
        ratings: product.ratings || { average: 0, count: 0 },
        category: product.category || [],
        thumbnail: product.images && product.images.length > 0 ? product.images[0].url : "",
      };
    });

    res.status(200).json({
      success: true,
      data: {
        ...popularData,
        products: formattedProducts
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. GET FOR ADMIN (To show in Form/Dashboard)
export const getAdminPopularProducts = async (req, res) => {
  try {
    const data = await PopularProducts.findOne().populate({
      path: "products",
      select: "title images basePrice discountPrice",
    });

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }

    res.status(200).json({
      success: true,
      data: data,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. RESET SECTION
export const deletePopularSection = async (req, res) => {
  try {
    await PopularProducts.deleteMany({});
    res.status(200).json({
      success: true,
      message: "Popular products section has been reset.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};