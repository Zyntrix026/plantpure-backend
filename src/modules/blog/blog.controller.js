import Blog from "./blog.model.js";
import slugify from "slugify";

const AUTHOR_POPULATE = {
  path: "author",
  select: "name email mobile status role",
  populate: { path: "role", select: "role_name display_name" },
};

const CATEGORY_POPULATE = { path: "categories", select: "name slug isActive" };

// Create Blog
export const createBlog = async (req, res) => {
  try {
    const {
      title,
      slug,
      excerpt,
      image,
      content,
      categories,
      tags,
      readTime,
      views,
      author,
      status,
      isFeatured,
      publishedAt,
      seo,
    } = req.body;

    if (!title || title.trim().length < 3)
      return res.status(400).json({
        success: false,
        message: "Title is required and must be at least 3 characters long",
      });

    if (!content || content.trim().length < 50)
      return res.status(400).json({
        success: false,
        message: "Content is required and must be at least 50 characters long",
      });

    if (content.length > 5000000)
      return res.status(400).json({
        success: false,
        message: "Content is too large. Maximum size is 5MB",
      });

    if (!categories || !Array.isArray(categories) || categories.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "At least one category is required" });

    if (!image || !image.url)
      return res
        .status(400)
        .json({ success: false, message: "Image URL is required" });

    if (!slug || slug.trim().length < 3)
      return res.status(400).json({ success: false, message: "Slug is required and must be at least 3 characters long" });

    const baseSlug = slugify(slug, { lower: true, strict: true });
    let finalSlug = baseSlug;
    let counter = 1;
    while (await Blog.findOne({ slug: finalSlug })) {
      finalSlug = `${baseSlug}-${counter++}`;
    }

    const blog = new Blog({
      title: title.trim(),
      slug: finalSlug,
      excerpt: excerpt?.trim(),
      image: { url: image.url, alt: image.alt || title, fileId: image.fileId },
      content: content.trim(),
      categories,
      tags: tags?.map((t) => t.toLowerCase().trim()) || [],
      readTime: readTime || Math.ceil(content.split(" ").length / 200),
      views: views || 0,
      author: author || req.user?._id,
      status: status || "draft",
      publishedAt:
        status === "published" ? publishedAt || new Date() : undefined,
      isFeatured: isFeatured || false,
      seo: {
        metaTitle: seo?.metaTitle || title,
        metaDescription: seo?.metaDescription || excerpt,
        keywords: seo?.keywords || tags,
        canonicalUrl: seo?.canonicalUrl,
      },
    });

    await blog.save();
    await blog.populate([AUTHOR_POPULATE, CATEGORY_POPULATE]);

    res
      .status(201)
      .json({ success: true, message: "Blog created successfully", blog });
  } catch (error) {
    console.error("Create Blog Error:", error);
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((e) => e.message);
      return res
        .status(400)
        .json({ success: false, message: "Validation failed", errors });
    }
    res
      .status(500)
      .json({ success: false, message: "Server error while creating blog" });
  }
};

// Get All Blogs (Admin)
export const getAllBlogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      featured,
      search,
    } = req.query;
    const query = {};

    if (category) query.categories = category;
    if (status) query.status = status;
    if (featured !== undefined) query.isFeatured = featured === "true";

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    const blogs = await Blog.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      /* FIXED SELECT STRING: Spaces hata diye aur format sahi kar diya */
      .select("-image -excerpt -categories -__v -author -content -seo");
    // .populate(AUTHOR_POPULATE); // NOTE: Agar 'author' ko minus kar diya hai toh populate hatana hoga

    const total = await Blog.countDocuments(query);

    res.json({
      success: true,
      blogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalBlogs: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Get All Blogs Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while fetching blogs" });
  }
};

// Get Published Blogs (Public)
export const getPublishedBlogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      featured,
      search,
      sortBy = "latest",
    } = req.query;

    const query = { status: "published" };

    // Saare filters pehle ki tarah hi hain
    if (category) query.categories = category;
    if (featured !== undefined) query.isFeatured = featured === "true";
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    let sortOption = { publishedAt: -1 };
    if (sortBy === "popular") sortOption = { views: -1 };
    if (sortBy === "oldest") sortOption = { publishedAt: 1 };

    const blogs = await Blog.find(query)
      .sort(sortOption)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      /* FIX 1: SEO ko select string se hata diya */
      .select("title slug excerpt image categories tags readTime author views publishedAt isFeatured")
      /* FIX 2: Author ka sirf Name aur ID populate kiya */
      .populate({
        path: "author",
        select: "name" // Email/Role hide ho jayenge
      })
      .populate(CATEGORY_POPULATE);

    const total = await Blog.countDocuments(query);

    res.json({
      success: true,
      blogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalBlogs: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Get Published Blogs Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching published blogs",
    });
  }
};

// Get Articles by Category Slug (Public)
export const getArticlesByCategory = async (req, res) => {
  try {
    const { slug } = req.params;
    console.log("slug",slug)
    const { page = 1, limit = 10, sortBy = "latest" } = req.query;

    const Category = (await import("../categories/category.model.js")).default;
    const category = await Category.findOne({ slug });
    console.log("category",category)
    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    let sortOption = { publishedAt: -1 };
    if (sortBy === "popular") sortOption = { views: -1 };
    if (sortBy === "oldest") sortOption = { publishedAt: 1 };

    const query = { status: "published", categories: category._id };

    const blogs = await Blog.find(query)
      .sort(sortOption)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select(
        "title slug excerpt image categories tags readTime author views publishedAt isFeatured",
      )
      /* Author populate ko modify kiya gaya hai */
      .populate({
        path: "author",
        select: "name", // By default _id hamesha aata hai, humne sirf name extra mangwaya hai
      })
      .populate(CATEGORY_POPULATE);

    const total = await Blog.countDocuments(query);

    res.json({
      success: true,
      category: { name: category.name, slug: category.slug },
      blogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalBlogs: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    console.error("Get Articles By Category Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching articles by category",
    });
  }
};

// Get Recent Articles (Public)
export const getRecentArticles = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const blogs = await Blog.find({ status: "published" })
      .sort({ publishedAt: -1 })
      .limit(parseInt(limit))
      .select(
        "title slug excerpt image categories tags readTime author views publishedAt isFeatured",
      )
      /* FIX: Author ki sirf name aur _id fetch karne ke liye */
      .populate({
        path: "author",
        select: "name" 
      })
      .populate(CATEGORY_POPULATE);

    res.json({ success: true, blogs });
  } catch (error) {
    console.error("Get Recent Articles Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching recent articles",
    });
  }
};

// Get Blog by Slug
export const getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    // 1. Blog fetch karo aur Author/Category ki limited info populate karo
    const blog = await Blog.findOneAndUpdate(
      { slug },
      { $inc: { views: 1 } }, // Views direct database mein increment honge
      { new: true }, // Updated blog return karega
    )
      .populate({
        path: "author",
        select: "name", // Yahan sirf name aur _id aayega
      })
      .populate(CATEGORY_POPULATE);

    if (!blog) {
      return res
        .status(404)
        .json({ success: false, message: "Blog not found" });
    }

    res.json({ success: true, blog });
  } catch (error) {
    console.error("Get Blog by Slug Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching blog",
    });
  }
};

// Get Blog by ID
export const getBlogById = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id)
      .populate(AUTHOR_POPULATE)
      .populate(CATEGORY_POPULATE);

    if (!blog)
      return res
        .status(404)
        .json({ success: false, message: "Blog not found" });

    res.json({ success: true, blog });
  } catch (error) {
    console.error("Get Blog by ID Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while fetching blog" });
  }
};

// Update Blog
export const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      excerpt,
      image,
      content,
      categories,
      tags,
      readTime,
      author,
      status,
      isFeatured,
      seo,
      slug
    } = req.body;

    const blog = await Blog.findById(id);
    if (!blog)
      return res
        .status(404)
        .json({ success: false, message: "Blog not found" });

    const updateData = {};

    if (title !== undefined) {
      if (!title || title.trim().length < 3)
        return res.status(400).json({
          success: false,
          message: "Title must be at least 3 characters long",
        });
      updateData.title = title.trim();
    }

    if (slug !== undefined) {
      if (!slug || slug.trim().length < 3)
        return res.status(400).json({
          success: false,
          message: "Slug must be at least 3 characters long",
        });
      const baseSlug = slugify(slug, { lower: true, strict: true });
      let finalSlug = baseSlug;
      let counter = 1;
      while (await Blog.findOne({ slug: finalSlug, _id: { $ne: id } })) {
        finalSlug = `${baseSlug}-${counter++}`;
      }
      updateData.slug = finalSlug;
    }

    if (excerpt !== undefined) updateData.excerpt = excerpt?.trim();

    if (image !== undefined) {
      if (!image?.url)
        return res
          .status(400)
          .json({ success: false, message: "Image URL is required" });
      updateData.image = {
        url: image.url,
        alt: image.alt || updateData.title || blog.title,
        fileId: image.fileId,
      };
    }

    if (content !== undefined) {
      if (!content || content.trim().length < 50)
        return res.status(400).json({
          success: false,
          message: "Content must be at least 50 characters long",
        });
      if (content.length > 5000000)
        return res.status(400).json({
          success: false,
          message: "Content is too large. Maximum size is 5MB",
        });
      updateData.content = content.trim();
    }

    if (categories !== undefined) {
      if (!Array.isArray(categories) || categories.length === 0)
        return res.status(400).json({
          success: false,
          message: "At least one category is required",
        });
      updateData.categories = categories;
    }

    if (tags !== undefined)
      updateData.tags = tags?.map((t) => t.toLowerCase().trim()) || [];
    if (readTime !== undefined)
      updateData.readTime =
        readTime ||
        (content ? Math.ceil(content.split(" ").length / 200) : blog.readTime);
    if (author !== undefined) updateData.author = author;
    if (isFeatured !== undefined) updateData.isFeatured = isFeatured;

    if (status !== undefined) {
      updateData.status = status;
      if (status === "published" && blog.status !== "published")
        updateData.publishedAt = new Date();
    }

    if (seo !== undefined) {
      updateData.seo = {
        metaTitle: seo?.metaTitle || updateData.title || blog.title,
        metaDescription:
          seo?.metaDescription || updateData.excerpt || blog.excerpt,
        keywords: seo?.keywords || updateData.tags || blog.tags,
        canonicalUrl: seo?.canonicalUrl,
      };
    }

    const updatedBlog = await Blog.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate(AUTHOR_POPULATE)
      .populate(CATEGORY_POPULATE);

    res.json({
      success: true,
      message: "Blog updated successfully",
      blog: updatedBlog,
    });
  } catch (error) {
    console.error("Update Blog Error:", error);
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((e) => e.message);
      return res
        .status(400)
        .json({ success: false, message: "Validation failed", errors });
    }
    res
      .status(500)
      .json({ success: false, message: "Server error while updating blog" });
  }
};

// Delete Blog
export const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog)
      return res
        .status(404)
        .json({ success: false, message: "Blog not found" });

    await Blog.findByIdAndDelete(id);
    res.json({
      success: true,
      message: "Blog and associated image deleted successfully",
    });
  } catch (error) {
    console.error("Delete Blog Error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while deleting blog" });
  }
};

// Publish Blog
export const publishBlog = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Blog update karein aur sirf zaroori Author details populate karein
    const blog = await Blog.findByIdAndUpdate(
      id,
      { 
        status: "published", 
        publishedAt: new Date() 
      },
      { new: true } // Updated data return karega
    )
    .select("-seo -__v") // SEO aur internal version ko exclude kiya
    .populate({
      path: "author",
      select: "name" // Sirf name aur _id fetch karega, email/role nahi
    });

    if (!blog) {
      return res
        .status(404)
        .json({ success: false, message: "Blog not found" });
    }

    // 2. Final response structure (SEO yahan se bhi hataya gaya hai)
    res.json({
      success: true,
      message: "Blog published successfully",
      blog: {
        id: blog._id,
        title: blog.title,
        slug: blog.slug,
        status: blog.status,
        publishedAt: blog.publishedAt,
        author: {
          id: blog.author?._id,
          name: blog.author?.name
        }
      },
    });
  } catch (error) {
    console.error("Publish Blog Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error while publishing blog" 
    });
  }
};


export const getAllSiteMapBlogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100, // Sitemap ke liye limit thodi zyada rakhi ja sakti hai
      category,
      status = "published", // Default published hi dikhao
    } = req.query;

    const query = { status };

    if (category) query.categories = category;

    const blogs = await Blog.find(query)
      .sort({ updatedAt: -1 }) // News site ke liye updatedAt zyada relevant hai
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      /* OPTIMIZATION: 
         Sirf wahi fields select karein jo zaroori hain. 
         'categories' se sirf slug chahiye sitemap path banane ke liye.
      */
      .select("slug updatedAt createdAt categories")
      .populate({
        path: "categories",
        select: "slug -_id", // Category ka bhi sirf slug lo, ID nahi
      })
      .lean(); // LEAN: Isse Mongoose documents plain JS objects ban jate hain (Faster)

    const total = await Blog.countDocuments(query);

    res.json({
      success: true,
      blogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalBlogs: total,
      },
    });
  } catch (error) {
    console.error("Get All Blogs Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};