import { DealsOfTheDay } from "./deals.model.js";
import { Product } from "../products/product.model.js"; // Populating ke liye zaroori hai

// 1. SAVE OR UPDATE DEALS SECTION (Admin Only)
export const saveOrUpdateDeals = async (req, res) => {
  try {
    const { 
        title, 
        bannerImage, 
        buttonText, 
        linkedCategory, 
        selectedProducts, 
        isActive 
    } = req.body;

    // Validation: Check if at least one product is selected
    if (selectedProducts && selectedProducts.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Please select at least one product for the deals section." 
      });
    }

    // Upsert logic: Ek hi document maintain karega pooray collection mein
    const dealsSection = await DealsOfTheDay.findOneAndUpdate(
      {}, // Empty filter: matches the first document found
      {
        title,
        bannerImage,
        buttonText,
        linkedCategory,
        selectedProducts,
        isActive
      },
      { 
        new: true, 
        upsert: true, // Agar document nahi hai toh naya banao
        runValidators: true 
      }
    );

    res.status(200).json({
      success: true,
      message: "Deals of the Day updated successfully!",
      data: dealsSection
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getPublicDeals = async (req, res) => {
  try {
    const deals = await DealsOfTheDay.findOne({ isActive: true })
      .populate({
        path: 'linkedCategory',
        select: 'name slug'
      })
      .populate({
        path: 'selectedProducts',
        select: 'title slug basePrice discountPrice images stock discountPercentage sku vatPercentage status hasVariants variants ratings category',
        match: { status: 'Active' },
        populate: { path: 'category', select: 'name slug' }
      })
      .lean();

    if (!deals) {
      return res.status(404).json({ 
        success: false, 
        message: "No active deals found at the moment." 
      });
    }

    // Selected Products ko Variant Array aur VAT logic ke saath map karna
    const formattedProducts = (deals.selectedProducts || []).map((product) => {
      const vatPercent = product.vatPercentage || 0;
      
      let baseExVat = 0;
      let discExVat = 0;
      let currentStock = 0;
      let formattedVariants = null;

      // Check if product has variants
      if (product.hasVariants && product.variants && product.variants.length > 0) {
        // A. Har ek variant object ke liye inner prices calculate karna
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

        // B. Main root node variables par structural fallback lagana (using Index 0)
        const firstVariant = product.variants[0];
        baseExVat = firstVariant.price || 0;
        discExVat = firstVariant.discountPrice || baseExVat;
        currentStock = firstVariant.stock || 0;

      } else {
        // Agar variants nahi hain, toh primary fields direct check hongi
        baseExVat = product.basePrice || 0;
        discExVat = product.discountPrice || baseExVat;
        currentStock = product.stock || 0;
      }

      // Root level calculations for response validation
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
        // Konditional spread syntax tabhi chalega jab flag true hoga
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
        ...deals,
        selectedProducts: formattedProducts
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. GET DEALS FOR ADMIN (To show current settings in Form)
export const getAdminDeals = async (req, res) => {
  try {
    // .populate() add karne se IDs replace ho jayengi real data se
    const deals = await DealsOfTheDay.findOne()
      .populate({
        path: 'linkedCategory',
        select: 'name slug' // Category ka naam aur slug chahiye
      })
      .populate({
        path: 'selectedProducts',
        // Aapko card ke liye jo jo chahiye wo yahan select karein
        select: 'title slug basePrice discountPrice images stock' 
      });

    if (!deals) {
      return res.status(404).json({ 
        success: false, 
        message: "No deals found" 
      });
    }

    res.status(200).json({
      success: true,
      data: deals
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 4. DELETE / RESET SECTION (Admin Only)
export const deleteDealsSection = async (req, res) => {
  try {
    const result = await DealsOfTheDay.deleteMany({});
    
    res.status(200).json({
      success: true,
      message: "Deals section has been reset/deleted.",
      count: result.deletedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};