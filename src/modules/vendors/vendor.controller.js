import * as vendorService from "./vendor.service.js";

// Get all vendors (admin)
export const getAllVendors = async (req, res) => {
  try {
    const { status } = req.query;
    const filters = status ? { status } : {};

    const vendors = await vendorService.getAllVendors(filters);

    res.status(200).json({
      success: true,
      count: vendors.length,
      data: vendors,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get vendor by ID
export const getVendorById = async (req, res) => {
  try {
    const vendor = await vendorService.getVendorById(req.params.id);

    res.status(200).json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

// Approve vendor (admin)
export const approveVendor = async (req, res) => {
  try {
    const vendor = await vendorService.approveVendor(
      req.params.id,
      req.user.userId,
    );

    res.status(200).json({
      success: true,
      message: "Vendor approved successfully",
      data: vendor,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Reject vendor (admin)
export const rejectVendor = async (req, res) => {
  try {
    const { reason } = req.body;

    const vendor = await vendorService.rejectVendor(
      req.params.id,
      req.user.userId,
      reason,
    );

    res.status(200).json({
      success: true,
      message: "Vendor rejected",
      data: vendor,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Update vendor status (admin)
export const updateVendorStatus = async (req, res) => {
  try {
    const { isActive } = req.body;

    const vendor = await vendorService.updateVendorStatus(
      req.params.id,
      isActive,
    );

    res.status(200).json({
      success: true,
      message: "Vendor status updated",
      data: vendor,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
