import express from "express";
import {
  uploadImage,
  uploadMultipleImages,
  deleteImage,
  getAuthParams,
  uploadContentImage,
  uploadPDF,
} from "../imageUpload/imageUploadController.js";
import {
  upload,
  uploadPDF as uploadPDFMiddleware,
} from "../../utils/imageUpload.services.js";
import { adminOnly } from "../../middleware/role.middleware.js";

const router = express.Router();

// Get ImageKit auth parameters (for frontend direct upload)
router.get("/auth", getAuthParams);

// Upload single image
router.post("/upload", adminOnly, upload.single("image"), uploadImage);

// Upload content image (for rich text editor)
router.post(
  "/upload-content",
  adminOnly,
  upload.single("file"),
  uploadContentImage,
);

// Upload multiple images
router.post(
  "/upload-multiple",
  adminOnly,
  upload.array("images", 5),
  uploadMultipleImages,
);

// Delete image
router.delete("/:fileId", adminOnly, deleteImage);

// Upload PDF (for brochures)
router.post(
  "/upload-pdf",
  adminOnly,
  uploadPDFMiddleware.single("file"),
  uploadPDF,
);

export default router;
