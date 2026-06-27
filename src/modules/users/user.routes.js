import express from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getCustomers,
  suspendCustomer,
  deleteCustomer,
  createAdmin,
  getAdmins,
  updateAdmin,
  deleteAdmin,
  suspendAdmin,
} from "./user.controller.js";
import { authenticatedUser, adminOnly } from "../../middleware/role.middleware.js";

const router = express.Router();

// Profile
router.get("/profile", authenticatedUser, getProfile);
router.patch("/profile", authenticatedUser, updateProfile);
router.patch("/change-password", authenticatedUser, changePassword);

// Addresses
router.post("/addresses", authenticatedUser, addAddress);
router.patch("/addresses/:addressId", authenticatedUser, updateAddress);
router.delete("/addresses/:addressId", authenticatedUser, deleteAddress);
router.patch("/addresses/:addressId/default", authenticatedUser, setDefaultAddress);

// Admin — Customer Management
router.get("/admin/customers", adminOnly, getCustomers);
router.patch("/admin/customers/:id/suspend", adminOnly, suspendCustomer);
router.delete("/admin/customers/:id", adminOnly, deleteCustomer);

// Admin — Admin Management
router.post("/admin/admins", adminOnly, createAdmin);
router.get("/admin/admins", adminOnly, getAdmins);
router.patch("/admin/admins/:id", adminOnly, updateAdmin);
router.delete("/admin/admins/:id", adminOnly, deleteAdmin);
router.patch("/admin/admins/:id/suspend", adminOnly, suspendAdmin);

export default router;
