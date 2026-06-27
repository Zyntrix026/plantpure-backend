import express from "express";
import {
  saveOrUpdateDeals,
  getPublicDeals,
  getAdminDeals,
  deleteDealsSection,
} from "./deals.controller.js";
import { adminOnly } from "../../middleware/role.middleware.js";

const router = express.Router();

// --- PUBLIC ROUTES (Website Home Page) ---
// Yeh API website ke front-end par data dikhane ke liye hai (Populated data)
router.get("/get-deals", getPublicDeals);

// 1. Get current settings for Admin Form (Selected IDs and Banner info)
router.get("/admin/get-deals", adminOnly, getAdminDeals);

// 2. Create or Update the section (Ek hi API dono kaam karegi)
router.post("/admin/save-deals", adminOnly, saveOrUpdateDeals);

// 3. Reset or Delete the entire section
router.delete("/admin/delete-deals", adminOnly, deleteDealsSection);

export default router;
