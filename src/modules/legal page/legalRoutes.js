import express from "express";
import {
  updatePrivacyPolicy,
  updateRefundPolicy,
  updateTermsConditions,
  getPageContent,
} from "./legalPageController.js";
import {
  authenticatedUser,
  adminOnly,
  anyAuthenticated,
  optionalAuth,
} from "../../middleware/role.middleware.js";

const router = express.Router();

// ─── ADMIN ENDPOINTS (DEDICATED APIS FOR FRONTEND PANEL) ───
router.put("/privacy-policy", adminOnly, updatePrivacyPolicy);
router.put("/refund-policy", adminOnly, updateRefundPolicy);
router.put("/terms-conditions", adminOnly, updateTermsConditions);

// ─── PUBLIC ENDPOINTS (STOREFRONT USER WEBSITE FETCH) ───
router.get("/public/:pageKey", getPageContent);

export default router;
