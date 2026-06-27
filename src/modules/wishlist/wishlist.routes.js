import express from "express";
import {
  getWishlist,
  toggleWishlist,
  mergeWishlist,
  clearWishlist,
  checkWishlisted,
} from "./wishlist.controller.js";
import { authenticatedUser } from "../../middleware/role.middleware.js";

const router = express.Router();

router.get("/", authenticatedUser, getWishlist);
router.post("/toggle/:productId", authenticatedUser, toggleWishlist);
router.post("/merge", authenticatedUser, mergeWishlist);
router.get("/check/:productId", authenticatedUser, checkWishlisted);
router.delete("/clear", authenticatedUser, clearWishlist);

export default router;
