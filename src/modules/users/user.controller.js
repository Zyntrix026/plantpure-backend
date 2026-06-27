import {
  getProfileService,
  updateProfileService,
  changePasswordService,
  addAddressService,
  updateAddressService,
  deleteAddressService,
  setDefaultAddressService,
  getCustomersService,
  toggleSuspendService,
  deleteCustomerService,
  createAdminService,
  getAdminsService,
  updateAdminService,
  deleteAdminService,
  toggleSuspendAdminService,
} from "./user.service.js";

// ─── GET /users/profile ───────────────────────────────────────────────────────
export const getProfile = async (req, res) => {
  try {
    const user = await getProfileService(req.user.userId);
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── PATCH /users/profile ─────────────────────────────────────────────────────
export const updateProfile = async (req, res) => {
  try {
    const user = await updateProfileService(req.user.userId, req.body);
    res.status(200).json({ success: true, message: "Profile updated successfully", data: user });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── PATCH /users/change-password ────────────────────────────────────────────
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "currentPassword and newPassword are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "newPassword must be at least 6 characters" });
    }

    await changePasswordService(req.user.userId, currentPassword, newPassword);
    res.status(200).json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── POST /users/addresses ────────────────────────────────────────────────────
export const addAddress = async (req, res) => {
  try {
    const { street, city, state, zipCode, country, isDefault } = req.body;

    if (!street || !city || !country) {
      return res.status(400).json({ success: false, message: "street, city and country are required" });
    }

    const addresses = await addAddressService(req.user.userId, { street, city, state, zipCode, country, isDefault });
    res.status(201).json({ success: true, message: "Address added successfully", data: addresses });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── PATCH /users/addresses/:addressId ───────────────────────────────────────
export const updateAddress = async (req, res) => {
  try {
    const addresses = await updateAddressService(req.user.userId, req.params.addressId, req.body);
    res.status(200).json({ success: true, message: "Address updated successfully", data: addresses });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── DELETE /users/addresses/:addressId ──────────────────────────────────────
export const deleteAddress = async (req, res) => {
  try {
    const addresses = await deleteAddressService(req.user.userId, req.params.addressId);
    res.status(200).json({ success: true, message: "Address deleted successfully", data: addresses });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── PATCH /users/addresses/:addressId/default ───────────────────────────────
export const setDefaultAddress = async (req, res) => {
  try {
    const addresses = await setDefaultAddressService(req.user.userId, req.params.addressId);
    res.status(200).json({ success: true, message: "Default address updated", data: addresses });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── ADMIN: POST /admin/admins ───────────────────────────────────────────────
export const createAdmin = async (req, res) => {
  try {
    const data = await createAdminService(req.body);
    res.status(201).json({ success: true, message: "Admin created successfully", data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── ADMIN: GET /admin/admins ─────────────────────────────────────────────────
export const getAdmins = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const result = await getAdminsService({ search, page, limit });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── ADMIN: PATCH /admin/admins/:id ──────────────────────────────────────────
export const updateAdmin = async (req, res) => {
  try {
    const data = await updateAdminService(req.params.id, req.body);
    res.status(200).json({ success: true, message: "Admin updated successfully", data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── ADMIN: DELETE /admin/admins/:id ─────────────────────────────────────────
export const deleteAdmin = async (req, res) => {
  try {
    await deleteAdminService(req.params.id);
    res.status(200).json({ success: true, message: "Admin deleted successfully" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── ADMIN: PATCH /admin/admins/:id/suspend ───────────────────────────────────
export const suspendAdmin = async (req, res) => {
  try {
    const result = await toggleSuspendAdminService(req.params.id);
    const msg = result.isActive ? "Admin activated" : "Admin suspended";
    res.status(200).json({ success: true, message: msg, data: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── ADMIN: GET /admin/customers ─────────────────────────────────────────────
export const getCustomers = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const result = await getCustomersService({ search, page, limit });
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── ADMIN: PATCH /admin/customers/:id/suspend ───────────────────────────────
export const suspendCustomer = async (req, res) => {
  try {
    const result = await toggleSuspendService(req.params.id);
    const msg = result.isActive ? "Customer activated" : "Customer suspended";
    res.status(200).json({ success: true, message: msg, data: result });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// ─── ADMIN: DELETE /admin/customers/:id ──────────────────────────────────────
export const deleteCustomer = async (req, res) => {
  try {
    await deleteCustomerService(req.params.id);
    res.status(200).json({ success: true, message: "Customer deleted successfully" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};
