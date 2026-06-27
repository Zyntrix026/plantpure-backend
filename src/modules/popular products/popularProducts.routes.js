import express from "express";
import {
  saveOrUpdatePopularProducts,
  getPublicPopularProducts,
  getAdminPopularProducts,
  deletePopularSection,
} from "./popularProducts.controller.js";
import { adminOnly } from "../../middleware/role.middleware.js";

const router = express.Router();

// --- PUBLIC ROUTES (Website Home Page) ---
router.get("/get-popular-products", getPublicPopularProducts);

// --- ADMIN ROUTES (Dashboard Management) ---

// 1. Current Popular products settings fetch karne ke liye (Form pre-fill karne ke liye)
router.get("/admin/get-popular", adminOnly, getAdminPopularProducts);

// 2. Popular products ko save ya update karne ke liye
router.post("/admin/save-popular", adminOnly, saveOrUpdatePopularProducts);

// 3. Poore section ko delete ya reset karne ke liye
router.delete("/admin/delete-popular", adminOnly, deletePopularSection);

export default router;