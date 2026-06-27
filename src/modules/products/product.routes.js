import express from "express";
import * as prodCtrl from "./product.controller.js";
import { adminOnly } from "../../middleware/role.middleware.js";

const router = express.Router();

// --- PUBLIC ROUTES ---
router.get("/", prodCtrl.getProducts);
router.get("/search", prodCtrl.searchProducts);
router.get("/details/:slug", prodCtrl.getProductBySlug);
router.get("/related/:id", prodCtrl.getRelatedProducts);
router.get("/search/suggestions", prodCtrl.getSearchSuggestions);
router.get("/review/product-details/:id", prodCtrl.getReviewProductDetails);
// --- ADMIN ROUTES ---

// Admin Dashboard controls for managing inventory

router.get('/admin/products-selection', adminOnly, prodCtrl.getProductsForSelection);
router.get("/admin/export/products", adminOnly, prodCtrl.exportProducts);  // ← must be before /admin/:id
router.post("/admin/create", adminOnly, prodCtrl.createProduct);
router.patch("/admin/update/:id", adminOnly, prodCtrl.updateProduct);
router.delete("/admin/delete/:id", adminOnly, prodCtrl.deleteProduct);
router.patch("/admin/toggle-status/:id", adminOnly, prodCtrl.toggleProductStatus);
router.get("/admin/:id", adminOnly, prodCtrl.getProductById);

// Optional: Bulk actions often needed for e-commerce dashboards
// router.post("/admin/bulk-upload", adminOnly, prodCtrl.bulkUpload);
// router.patch("/admin/inventory-update", adminOnly, prodCtrl.bulkUpdateStock);

export default router;