import express from "express";
const router = express.Router();
import {
  addBanner,
  getActiveBanners,
  updateBanner,
  deleteBanner,
  getAllBannersForAdmin,
} from "./heroBanner.controller.js";
import { adminOnly } from "../../middleware/role.middleware.js";

// Public Route
router.get("/active", getActiveBanners);

// Admin Routes (Add your Auth middleware here)
router.get("/admin/", adminOnly, getAllBannersForAdmin);
router.post("/admin/add", adminOnly, addBanner);
router.put("/admin/update/:id", adminOnly, updateBanner);
router.delete("/admin/delete/:id", adminOnly, deleteBanner);

export default router;
