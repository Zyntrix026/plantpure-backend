import express from "express";
import { body } from "express-validator";
import {
  getReviews,
  createReview,
  updateReview,
  deleteReview,
} from "./googleReveiw.controllers.js";
import {
  authenticatedUser,
  adminOnly,
} from "../../middleware/role.middleware.js";
const router = express.Router();

// Input Validation Middleware Rules
const reviewValidationRules = [
  body("name")
    .notEmpty()
    .withMessage("Customer name is required")
    .isLength({ max: 100 })
    .withMessage("Name is too long"),

  body("rating")
    .notEmpty()
    .withMessage("Rating is required")
    .isInt({ min: 1, max: 5 })
    .withMessage("Rating must be an integer between 1 and 5"),

  body("comment")
    .notEmpty()
    .withMessage("Review comment is required")
    .isLength({ min: 5, max: 1000 })
    .withMessage("Comment must be between 5 and 1000 characters"),

  body("image")
    .optional({ checkFalsy: true })
    .isURL()
    .withMessage("Please provide a valid image URL"),
];


router.get("/", getReviews);
router.post("/", adminOnly, reviewValidationRules, createReview);
router.put("/:id", adminOnly, reviewValidationRules, updateReview);
router.delete("/:id", adminOnly, deleteReview);

export default router;