import Vendor from './vendor.model.js';

// Get all vendors (admin)
export const getAllVendors = async (filters = {}) => {
  const vendors = await Vendor.find(filters).select('-password');
  return vendors;
};

// Get vendor by ID
export const getVendorById = async (vendorId) => {
  const vendor = await Vendor.findById(vendorId).select('-password');
  if (!vendor) {
    throw new Error('Vendor not found');
  }
  return vendor;
};

// Approve vendor (admin)
export const approveVendor = async (vendorId, adminId) => {
  const vendor = await Vendor.findById(vendorId);
  
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  if (vendor.status === 'approved') {
    throw new Error('Vendor is already approved');
  }

  vendor.status = 'approved';
  vendor.approvedBy = adminId;
  vendor.approvedAt = new Date();
  vendor.rejectionReason = undefined;

  await vendor.save();

  return vendor;
};

// Reject vendor (admin)
export const rejectVendor = async (vendorId, adminId, reason) => {
  const vendor = await Vendor.findById(vendorId);
  
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  vendor.status = 'rejected';
  vendor.approvedBy = adminId;
  vendor.rejectionReason = reason || 'Not specified';

  await vendor.save();

  return vendor;
};

// Update vendor status
export const updateVendorStatus = async (vendorId, isActive) => {
  const vendor = await Vendor.findByIdAndUpdate(
    vendorId,
    { isActive },
    { returnDocument: 'after' }
  ).select('-password');

  if (!vendor) {
    throw new Error('Vendor not found');
  }

  return vendor;
};
