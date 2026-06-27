import { Product } from "../products/product.model.js";
import { Category } from "./category.model.js";
import slugify from "slugify";

// --- Helper: Recursive Tree Builder ---
const createCategories = (categories, parentId = null) => {
  const categoryList = [];
  let category;
  if (parentId == null) {
    category = categories.filter((cat) => !cat.parentId);
  } else {
    category = categories.filter(
      (cat) => String(cat.parentId) === String(parentId),
    );
  }

  for (let cate of category) {
    categoryList.push({
      _id: cate._id,
      name: cate.name,
      slug: cate.slug,
      status: cate.status || "Active",
      parentId: cate.parentId,
      children: createCategories(categories, cate._id),
    });
  }
  return categoryList;
};

// 1. CREATE Category / Sub-category
export const addCategory = async (req, res) => {
  try {
    const { name, parentId, status } = req.body;

    // Duplicate check: same name under same parent only
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      parentId: parentId || null,
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists under the same parent.",
      });
    }

    // Slug: append last 6 chars of parentId for sub-categories to ensure uniqueness
    const baseSlug = slugify(name, { lower: true });
    const slug = parentId ? `${baseSlug}-${String(parentId).slice(-6)}` : baseSlug;

    const categoryObj = {
      name,
      slug,
      status: status || "Active",
      parentId: parentId || null,
    };

    const cat = new Category(categoryObj);
    const savedCat = await cat.save();
    res.status(201).json({ success: true, category: savedCat });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 2. GET All Categories (Tree Structure)
export const getCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    const categoryList = createCategories(categories);
    res.status(200).json({ success: true, categoryList });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 3. UPDATE Category
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parentId, status } = req.body;

    // Duplicate name check: same name under same parent, excluding self
    if (name) {
      const resolvedParentId = parentId === "" || parentId === undefined ? null : parentId;
      const existingCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${name}$`, "i") },
        parentId: resolvedParentId,
        _id: { $ne: id },
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: "This name is already in use under the same parent.",
        });
      }
    }

    // --- NEW LOGIC: Status Check for Children ---
    // Agar user status ko "Inactive" karne ki koshish kar raha hai
    if (status === "Inactive") {
      // Check karein ki kya is category ka koi "Active" child hai
      const activeChildren = await Category.findOne({
        parentId: id,
        status: "Active",
      });

      if (activeChildren) {
        return res.status(400).json({
          success: false,
          message: "Inactive sub-categories first",
        });
      }
    }
    
    // --- END NEW LOGIC ---

    const updatedData = { ...req.body };

    if (name) {
      const resolvedParentId = parentId === "" || parentId === undefined || parentId === null
        ? null
        : parentId;
      const baseSlug = slugify(name, { lower: true });
      updatedData.slug = resolvedParentId ? `${baseSlug}-${String(resolvedParentId).slice(-6)}` : baseSlug;
    }

    // parentId fix for empty string
    if (parentId === "" || parentId === null || parentId === undefined) {
      updatedData.parentId = null;
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { $set: updatedData },
      { returnDocument: 'after', runValidators: true },
    );

    if (!updatedCategory) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    res.status(200).json({ success: true, updatedCategory });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 4. DELETE Category (Recursive Cleanup)
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Delete the category itself and any items that list it as a parent
    const result = await Category.deleteMany({
      $or: [{ _id: id }, { parentId: id }],
    });

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} items.`,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 5. BULK CREATE Categories
export const bulkCreateCategories = async (req, res) => {
  try {
    const { categories } = req.body;

    if (!Array.isArray(categories) || categories.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid data format." });
    }

    const names = categories.map((c) => c.name);
    const existing = await Category.find({ name: { $in: names } });

    if (existing.length > 0) {
      const existingNames = existing.map((e) => e.name).join(", ");
      return res.status(400).json({
        success: false,
        message: `Already exists: ${existingNames}`,
      });
    }

    const categoriesWithSlugs = categories.map((cat) => ({
      ...cat,
      slug: slugify(cat.name, { lower: true }),
      status: cat.status || "Active",
    }));

    const createdData = await Category.insertMany(categoriesWithSlugs);
    res.status(201).json({ success: true, count: createdData.length });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 6. BULK DELETE Categories
export const bulkDeleteCategories = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No IDs provided." });
    }

    // Delete selected IDs and their immediate children to prevent count errors
    await Category.deleteMany({
      $or: [{ _id: { $in: ids } }, { parentId: { $in: ids } }],
    });

    res
      .status(200)
      .json({ success: true, message: "Categories deleted successfully." });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// 7. GET Category Stats (Dashboard)
export const getCategoryStats = async (req, res) => {
  try {
    const [total, active, inactive] = await Promise.all([
      Category.countDocuments(),
      Category.countDocuments({ status: "Active" }),
      Category.countDocuments({ status: "Inactive" }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalCategories: total,
        activeCategories: active,
        inactiveCategories: inactive,
        activePercentage:
          total > 0 ? ((active / total) * 100).toFixed(1) + "%" : "0%",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// This API returns all categories that have a parent (i.e., Sub-categories only)
export const getCategoriesFormatted = async (req, res) => {
  try {
    // FIX: Yahan 'slug' ko add kiya gaya hai projection mein
    const allCategories = await Category.find({}, "_id name slug parentId status").lean();

    const createStructure = (categories, parentId = null) => {
      const categoryList = [];
      let filteredCategories;

      if (parentId === null) {
        filteredCategories = categories.filter((cat) => !cat.parentId);
      } else {
        filteredCategories = categories.filter(
          (cat) => String(cat.parentId) === String(parentId)
        );
      }

      for (let cate of filteredCategories) {
        const children = createStructure(categories, cate._id);

        const categoryObj = {
          _id: cate._id,
          name: cate.name,
          slug: cate.slug, // Ab ye available hoga kyunki upar fetch kiya hai
          status: cate.status // Status bhi include kar lete hain table ke liye
        };

        if (children.length > 0) {
          categoryObj.children = children;
        }

        categoryList.push(categoryObj);
      }

      return categoryList;
    };

    const formattedList = createStructure(allCategories);

    res.status(200).json({
      success: true,
      categoryList: formattedList,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// getProduct by category slug

export const getProductsByCategorySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    let {
      page = 1,
      limit = 12,
      sort = "newest",
      includeSubCats = "true",
      search = "",
    } = req.query;

    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 12;
    const skip = (page - 1) * limit;

    // 1. Find Category
    const category = await Category.findOne({ slug: slug });
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    // 2. Hierarchy Logic
    let categoryIds = [category._id];
    if (includeSubCats === "true") {
      const subCategories = await Category.find({ parentId: category._id }).select("_id");
      categoryIds = [...categoryIds, ...subCategories.map((cat) => cat._id)];
    }

    // 3. Filter Setup
    let filter = {
      category: { $in: categoryIds },
      status: "Active",
    };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
      ];
    }

    // 4. Sorting logic
    let sortOptions = {};
    if (sort === "price_asc") sortOptions.discountPrice = 1;
    else if (sort === "price_desc") sortOptions.discountPrice = -1;
    else sortOptions.createdAt = -1;

    // 5. Fetch Products
    const [products, totalProducts] = await Promise.all([
      Product.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .populate("category", "name slug")
        .select("title slug sku basePrice discountPrice vatPercentage discountPercentage images status stock category createdAt hasVariants variants ratings")
        .lean(),
      Product.countDocuments(filter),
    ]);

    // 6. Data Transform with Variant Array & VAT Logic
    const formattedData = products.map((product) => {
      const vatPercent = product.vatPercentage || 0;
      
      let baseExVat = 0;
      let discExVat = 0;
      let currentStock = 0;
      let formattedVariants = null;

      // Check if product has variants
      if (product.hasVariants && product.variants && product.variants.length > 0) {
        // A. Pure variants array ko map karke har ek variant ka price and VAT logic calculate karna
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

        // B. Main fallback pricing details ke liye FIRST variant ko chunna
        const firstVariant = product.variants[0];
        baseExVat = firstVariant.price || 0;
        discExVat = firstVariant.discountPrice || baseExVat;
        currentStock = firstVariant.stock || 0;

      } else {
        // Agar variants nahi hain, toh main product fields se data pick hoga
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
        hasVariants: product.hasVariants,
        stock: currentStock, // Agar variant h toh first variant ka stock dikhega
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
        // Yahan calculated variants array tabhi pass hoga jab product.hasVariants true hoga
        ...(product.hasVariants && { variants: formattedVariants }),
        vatPercentage: vatPercent,
        discountPercentage: product.discountPercentage,
        ratings: product.ratings || { average: 0, count: 0 },
        category: product.category,
        thumbnail: product.images && product.images.length > 0 ? product.images[0].url : "",
        createdAt: product.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      meta: {
        totalProducts,
        totalPages: Math.ceil(totalProducts / limit),
        currentPage: page,
        limit
      },
      searchQuery: search,
      data: formattedData,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
