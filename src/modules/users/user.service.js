import bcrypt from "bcryptjs";
import User from "./user.model.js";
import { Order } from "../orders/order.model.js";

// ─── 1. Get Profile ───────────────────────────────────────────────────────────
export const getProfileService = async (userId) => {
  const user = await User.findById(userId).select("-refreshToken -passwordResetToken -passwordResetExpires");
  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });
  return user;
};

// ─── 2. Update Profile ────────────────────────────────────────────────────────
export const updateProfileService = async (userId, body) => {
  const { name, phone, gender, avatar } = body;

  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

  if (name) user.name = name;
  if (phone) user.phone = phone;
  if (gender) user.gender = gender;
  if (avatar) user.avatar = avatar;

  await user.save();

  return user;
};

// ─── 3. Change Password ───────────────────────────────────────────────────────
export const changePasswordService = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select("+password");
  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) throw Object.assign(new Error("Current password is incorrect"), { statusCode: 400 });

  user.password = newPassword;
  await user.save();
};

// ─── 4. Add Address ───────────────────────────────────────────────────────────
export const addAddressService = async (userId, addressData) => {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

  // If new address is default, unset all others
  if (addressData.isDefault) {
    user.addresses.forEach((a) => (a.isDefault = false));
  }

  // If no addresses yet, make this default automatically
  if (user.addresses.length === 0) addressData.isDefault = true;

  user.addresses.push(addressData);
  await user.save();

  return user.addresses;
};

// ─── 5. Update Address ────────────────────────────────────────────────────────
export const updateAddressService = async (userId, addressId, addressData) => {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

  const address = user.addresses.id(addressId);
  if (!address) throw Object.assign(new Error("Address not found"), { statusCode: 404 });

  if (addressData.isDefault) {
    user.addresses.forEach((a) => (a.isDefault = false));
  }

  Object.assign(address, addressData);
  await user.save();

  return user.addresses;
};

// ─── 6. Delete Address ────────────────────────────────────────────────────────
export const deleteAddressService = async (userId, addressId) => {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

  const address = user.addresses.id(addressId);
  if (!address) throw Object.assign(new Error("Address not found"), { statusCode: 404 });

  address.deleteOne();
  await user.save();

  return user.addresses;
};

// ─── ADMIN: Get All Customers ────────────────────────────────────────────────
export const getCustomersService = async ({ search, page, limit }) => {
  const parsedPage = parseInt(page) || 1;
  const parsedLimit = parseInt(limit) || 10;
  const skip = (parsedPage - 1) * parsedLimit;

  const query = { role: "customer" };

  if (search && search.trim()) {
    const s = search.trim();
    query.$or = [
      { name: { $regex: s, $options: "i" } },
      { email: { $regex: s, $options: "i" } },
      { phone: { $regex: s, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .select("name email phone isActive createdAt avatar")
      .sort("-createdAt")
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    User.countDocuments(query),
  ]);

  // Fetch order stats for fetched users in one aggregation
  const userIds = users.map((u) => u._id);
  const orderStats = await Order.aggregate([
    { $match: { userId: { $in: userIds }, paymentStatus: "paid" } },
    {
      $group: {
        _id: "$userId",
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: "$totalPrice" },
      },
    },
  ]);

  const statsMap = {};
  orderStats.forEach((s) => {
    statsMap[s._id.toString()] = { totalOrders: s.totalOrders, totalSpent: s.totalSpent };
  });

  const data = users.map((u) => ({
    ...u,
    totalOrders: statsMap[u._id.toString()]?.totalOrders || 0,
    totalSpent: statsMap[u._id.toString()]?.totalSpent || 0,
  }));

  return { data, total, totalPages: Math.ceil(total / parsedLimit) || 1, currentPage: parsedPage };
};

// ─── ADMIN: Create Admin ─────────────────────────────────────────────────────
export const createAdminService = async ({ name, email, password }) => {
  if (!name || !email || !password) throw Object.assign(new Error("name, email and password are required"), { statusCode: 400 });
  if (password.length < 6) throw Object.assign(new Error("Password must be at least 6 characters"), { statusCode: 400 });

  const exists = await User.findOne({ email: email.toLowerCase().trim() });
  if (exists) throw Object.assign(new Error("Email already in use"), { statusCode: 409 });

  const user = await User.create({ name, email, password, role: "admin" });
  return { _id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive, createdAt: user.createdAt };
};

// ─── ADMIN: Get All Admins ────────────────────────────────────────────────────
export const getAdminsService = async ({ search, page, limit }) => {
  const parsedPage = parseInt(page) || 1;
  const parsedLimit = parseInt(limit) || 10;
  const skip = (parsedPage - 1) * parsedLimit;

  const query = { role: "admin" };
  if (search?.trim()) {
    const s = search.trim();
    query.$or = [
      { name: { $regex: s, $options: "i" } },
      { email: { $regex: s, $options: "i" } },
    ];
  }

  const [data, total] = await Promise.all([
    User.find(query).select("name email isActive createdAt").sort("-createdAt").skip(skip).limit(parsedLimit).lean(),
    User.countDocuments(query),
  ]);

  return { data, total, totalPages: Math.ceil(total / parsedLimit) || 1, currentPage: parsedPage };
};

// ─── ADMIN: Update Admin ──────────────────────────────────────────────────────
export const updateAdminService = async (adminId, { name, email, password }) => {
  const user = await User.findOne({ _id: adminId, role: "admin" });
  if (!user) throw Object.assign(new Error("Admin not found"), { statusCode: 404 });

  if (name) user.name = name;
  if (email) {
    const exists = await User.findOne({ email: email.toLowerCase().trim(), _id: { $ne: adminId } });
    if (exists) throw Object.assign(new Error("Email already in use"), { statusCode: 409 });
    user.email = email;
  }
  if (password) {
    if (password.length < 6) throw Object.assign(new Error("Password must be at least 6 characters"), { statusCode: 400 });
    user.password = password;
  }

  await user.save();
  return { _id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive };
};

// ─── ADMIN: Delete Admin ──────────────────────────────────────────────────────
export const deleteAdminService = async (adminId) => {
  const user = await User.findOneAndDelete({ _id: adminId, role: "admin" });
  if (!user) throw Object.assign(new Error("Admin not found"), { statusCode: 404 });
};

// ─── ADMIN: Toggle Suspend Admin ─────────────────────────────────────────────
export const toggleSuspendAdminService = async (adminId) => {
  const user = await User.findOne({ _id: adminId, role: "admin" });
  if (!user) throw Object.assign(new Error("Admin not found"), { statusCode: 404 });
  user.isActive = !user.isActive;
  await user.save();
  return { _id: user._id, isActive: user.isActive };
};

// ─── ADMIN: Toggle Suspend ────────────────────────────────────────────────────
export const toggleSuspendService = async (userId) => {
  const user = await User.findOne({ _id: userId, role: "customer" });
  if (!user) throw Object.assign(new Error("Customer not found"), { statusCode: 404 });
  user.isActive = !user.isActive;
  await user.save();
  return { _id: user._id, isActive: user.isActive };
};

// ─── ADMIN: Delete Customer ───────────────────────────────────────────────────
export const deleteCustomerService = async (userId) => {
  const user = await User.findOneAndDelete({ _id: userId, role: "customer" });
  if (!user) throw Object.assign(new Error("Customer not found"), { statusCode: 404 });
};

// ─── 7. Set Default Address ───────────────────────────────────────────────────
export const setDefaultAddressService = async (userId, addressId) => {
  const user = await User.findById(userId);
  if (!user) throw Object.assign(new Error("User not found"), { statusCode: 404 });

  const address = user.addresses.id(addressId);
  if (!address) throw Object.assign(new Error("Address not found"), { statusCode: 404 });

  user.addresses.forEach((a) => (a.isDefault = false));
  address.isDefault = true;

  await user.save();
  return user.addresses;
};
