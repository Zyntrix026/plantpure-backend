import express from "express";
import * as catCtrl from "./category.controller.js";
import { adminOnly } from "../../middleware/role.middleware.js";

const router = express.Router();

// --- PUBLIC ROUTE ---
// Website ke navbar/sidebar ke liye
router.get("/", catCtrl.getCategories);
router.get("/getallsub", catCtrl.getCategoriesFormatted);
router.get("/:slug", catCtrl.getProductsByCategorySlug);

// --- ADMIN ROUTES ---
// Admin Dashboard ke liye saare controls

router.get("/admin/stats", adminOnly, catCtrl.getCategoryStats);
router.post("/admin/create", adminOnly, catCtrl.addCategory);
router.patch("/admin/update/:id", adminOnly, catCtrl.updateCategory);
router.delete("/admin/delete/:id", adminOnly, catCtrl.deleteCategory);

router.post("/admin/bulk-create", adminOnly, catCtrl.bulkCreateCategories);
router.delete("/admin/bulk-delete", adminOnly, catCtrl.bulkDeleteCategories);

export default router;
