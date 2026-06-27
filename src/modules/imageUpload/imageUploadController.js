import {
  uploadToImageKit,
  uploadPDFToImageKit,
  deleteFromImageKit,
  getImageKitAuth,
} from "../../utils/imageUpload.services.js";

// Upload single image
export const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    const { folder = "products/images" } = req.body;

    const uploadResult = await uploadToImageKit(req.file, folder);

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to upload image",
        error: uploadResult.error,
      });
    }

    res.json({
      success: true,
      message: "Image uploaded successfully",
      image: {
        url: uploadResult.url,
        fileId: uploadResult.fileId,
        name: uploadResult.name,
        size: uploadResult.size,
      },
    });
  } catch (error) {
    console.error("Upload Image Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while uploading image",
    });
  }
};

// Upload content image (for rich text editor)
export const uploadContentImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No image file provided",
      });
    }

    const uploadResult = await uploadToImageKit(req.file, "blogs/content");

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to upload content image",
        error: uploadResult.error,
      });
    }

    // Return format compatible with rich text editors
    res.json({
      success: true,
      url: uploadResult.url,
      fileId: uploadResult.fileId,
      location: uploadResult.url, // For TinyMCE compatibility
    });
  } catch (error) {
    console.error("Upload Content Image Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while uploading content image",
    });
  }
};

// Upload multiple images
export const uploadMultipleImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No image files provided",
      });
    }

    const { folder = "blogs" } = req.body;
    const uploadPromises = req.files.map((file) =>
      uploadToImageKit(file, folder),
    );
    const results = await Promise.all(uploadPromises);

    const successfulUploads = results.filter((result) => result.success);
    const failedUploads = results.filter((result) => !result.success);

    res.json({
      success: true,
      message: `${successfulUploads.length} images uploaded successfully`,
      images: successfulUploads.map((result) => ({
        url: result.url,
        fileId: result.fileId,
        name: result.name,
        size: result.size,
      })),
      failed: failedUploads.length,
      errors: failedUploads.map((result) => result.error),
    });
  } catch (error) {
    console.error("Upload Multiple Images Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while uploading images",
    });
  }
};

// Delete image
export const deleteImage = async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: "File ID is required",
      });
    }

    const deleteResult = await deleteFromImageKit(fileId);

    if (!deleteResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to delete image",
        error: deleteResult.error,
      });
    }

    res.json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    console.error("Delete Image Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting image",
    });
  }
};

// Get ImageKit authentication for frontend
export const getAuthParams = async (req, res) => {
  try {
    const authParams = getImageKitAuth();

    res.json({
      success: true,
      authParams,
    });
  } catch (error) {
    console.error("Get Auth Params Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while getting auth parameters",
    });
  }
};

// Upload PDF (for brochures)
export const uploadPDF = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No PDF file provided",
      });
    }

    const { folder = "brochures" } = req.body;

    const uploadResult = await uploadPDFToImageKit(req.file, folder);

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to upload PDF",
        error: uploadResult.error,
      });
    }

    res.json({
      success: true,
      message: "PDF uploaded successfully",
      file: {
        url: uploadResult.url,
        fileId: uploadResult.fileId,
        name: uploadResult.name,
        size: uploadResult.size,
      },
    });
  } catch (error) {
    console.error("Upload PDF Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while uploading PDF",
    });
  }
};
