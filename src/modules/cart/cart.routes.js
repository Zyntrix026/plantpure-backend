import express from "express";
import {
  addToCart,
  removeProduct,
  removeItemCompletely,
  clearCart,
  getCart,
  updateItemQuantity,
  mergeCart,
} from "./cart.controller.js";
import { authenticatedUser } from "../../middleware/role.middleware.js";

const router = express.Router();

router.get("/", authenticatedUser, getCart);
router.post("/add", authenticatedUser, addToCart);
router.post("/merge", authenticatedUser, mergeCart);

// variantId passed as query param: ?variantId=xxx
router.patch("/update/:productId", authenticatedUser, updateItemQuantity);   // set exact qty
router.delete("/remove/:productId", authenticatedUser, removeProduct);        // decrease qty by 1
router.delete("/remove/:productId/all", authenticatedUser, removeItemCompletely); // remove fully
router.delete("/clear", authenticatedUser, clearCart);

export default router;
