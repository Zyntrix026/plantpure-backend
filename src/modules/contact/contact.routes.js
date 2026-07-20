import express from "express";
import {
  createInquiry,
  deleteInquiry,
  getAllInquiries,
  updateInquiryStatus,
} from "./contact.controller.js";
import { adminOnly } from "../../middleware/role.middleware.js";

const router = express.Router();

router.post("/", createInquiry);
router.get("/", adminOnly, getAllInquiries);
router.patch("/:id/status", adminOnly, updateInquiryStatus);
router.delete("/:id", adminOnly, deleteInquiry);

export default router;
