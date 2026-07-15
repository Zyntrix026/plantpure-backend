import Inquiry from "./contact.model.js"; // Note: .js extension is required in ES Modules

/**
 * @desc    Create a new product inquiry (Without Subject Field)
 * @route   POST /api/inquiries
 * @access  Public
 */
export const createInquiry = async (req, res) => {
  try {
    const {
      name,
      email,
      mobile,
      productType,
      quantity,
      message,
      dataConsent,
    } = req.body;

    // --- 1. Manual Field Presence Validation (Subject Removed) ---
    if (!name?.trim() || !email?.trim() || !mobile?.trim() || !productType?.trim() || !message?.trim()) {
      return res.status(400).json({
        success: false,
        error: "All required fields must be filled and cannot be empty or contain only whitespaces.",
      });
    }

    // --- 2. Email Format Validation ---
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: "Please provide a valid email address.",
      });
    }

    // --- 3. Mobile Number Validation ---
    const mobileRegex = /^\+?[0-9]{10,12}$/;
    if (!mobileRegex.test(mobile.trim())) {
      return res.status(400).json({
        success: false,
        error: "Please enter a valid 10 to 12 digit mobile number.",
      });
    }

    // --- 4. Quantity Type and Range Validation ---
    const parsedQuantity = parseInt(quantity, 10);
    if (isNaN(parsedQuantity) || parsedQuantity < 1) {
      return res.status(400).json({
        success: false,
        error: "Quantity must be a valid number and at least 1.",
      });
    }

    // --- 5. Message Length Check ---
    if (message.trim().length < 10) {
      return res.status(400).json({
        success: false,
        error: "Message must be at least 10 characters long.",
      });
    }

    // --- 6. Data Collection Consent Check ---
    if (dataConsent !== true && dataConsent !== "true") {
      return res.status(400).json({
        success: false,
        error: "You must agree to the data collection terms.",
      });
    }

    // --- 7. Product Type Enum Validation ---
    const allowedProducts = [
      "Hibiscus Flower Oil",
      "Moringa Oil",
      "Organic Cold-Pressed Jojoba Seed Oil",
      "Color Secure Hair Cleanser",
      "Cleansing & Nourishing Hair Cleanser",
    ];
    if (!allowedProducts.includes(productType.trim())) {
      return res.status(400).json({
        success: false,
        error: "Selected product type is invalid.",
      });
    }

    // Data Sanitization (Subject field completely removed from saving logic)
    const newInquiry = new Inquiry({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      mobile: mobile.trim(), 
      productType: productType.trim(),
      quantity: parsedQuantity,
      message: message.trim(),
      dataConsent: true,
    });

    const savedInquiry = await newInquiry.save();

    return res.status(201).json({
      success: true,
      message: "Inquiry submitted successfully!",
      data: savedInquiry,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({ success: false, error: messages[0] });
    }

    return res.status(500).json({
      success: false,
      error: "Internal Server Error. Please try again later.",
    });
  }
};

/**
 * @desc    Get all inquiries sorted by newest first
 * @route   GET /api/inquiries
 * @access  Private / Admin
 */
export const getAllInquiries = async (req, res) => {
  try {
    const inquiries = await Inquiry.find().sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: inquiries.length,
      data: inquiries,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch inquiries.",
    });
  }
};

/**
 * @desc    Update the processing status of a specific inquiry
 * @route   PATCH /api/inquiries/:id
 * @access  Private / Admin
 */
export const updateInquiryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: "Invalid Inquiry ID format.",
      });
    }

    const validStatuses = ["New", "Contacted", "Converted", "Ignored"];
    if (!status || !validStatuses.includes(status.trim())) {
      return res.status(400).json({
        success: false,
        error: "Invalid status value provided.",
      });
    }

    const updatedInquiry = await Inquiry.findByIdAndUpdate(
      id,
      { status: status.trim() },
      { new: true, runValidators: true }
    );

    if (!updatedInquiry) {
      return res.status(404).json({
        success: false,
        error: "Inquiry not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Status updated to ${status} successfully!`,
      data: updatedInquiry,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to update status.",
    });
  }
};

/**
 * @desc    Delete a specific inquiry from database
 * @route   DELETE /api/inquiries/:id
 * @access  Private / Admin
 */
export const deleteInquiry = async (req, res) => {
  try {
    const { id } = req.params;

    // MongoDB ObjectId Format Check
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        error: "Invalid Inquiry ID format.",
      });
    }

    const deletedInquiry = await Inquiry.findByIdAndDelete(id);

    if (!deletedInquiry) {
      return res.status(404).json({
        success: false,
        error: "Inquiry not found or already deleted.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Inquiry deleted successfully from the database.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to delete inquiry from database.",
    });
  }
};