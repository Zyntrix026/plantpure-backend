import express from "express";
import {
  createBlog,
  getAllBlogs,
  getPublishedBlogs,
  getBlogBySlug,
  getArticlesByCategory,
  getRecentArticles,
  updateBlog,
  deleteBlog,
  publishBlog,
  getBlogById,
  getAllSiteMapBlogs,
} from "./blog.controller.js";
import { adminOnly } from "../../middleware/role.middleware.js";

const router = express.Router();

// Public routes
router.get("/", getPublishedBlogs);
router.get("/getall", getAllSiteMapBlogs);
router.get("/recent", getRecentArticles);
router.get("/slug/:slug", getBlogBySlug);
// router.get("/category/:slug", getArticlesByCategory);

// Protected routes - require blog permissions
router.get("/admin", adminOnly, getAllBlogs);
router.post("/", adminOnly, createBlog);
router.get("/:id", adminOnly, getBlogById);
router.put("/:id", adminOnly, updateBlog);
router.delete("/:id", adminOnly, deleteBlog);
router.patch("/:id/publish", adminOnly, publishBlog);

export default router;
