import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Resend } from 'resend';
import User from '../users/user.model.js';
import Vendor from '../vendors/vendor.model.js';

// Lazy init — .env load hone ke baad use hoga
const getResend = () => new Resend(process.env.RESEND_API_KEY);

const JWT_SECRET = process.env.JWT_SECRET || "92a016457feb9a7f7b4045d628f5c830cbb50c822250d4033a9d08709cf7b75a"
const JWT_EXPIRE = process.env.JWT_EXPIRE || "7d"
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2"
const JWT_REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || "30d"

// Generate Access Token
export const generateToken = (userId, role) => {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
};

// Generate Refresh Token
export const generateRefreshToken = (userId, role) => {
  return jwt.sign({ userId, role }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRE });
};

// Register User/Customer
export const registerUser = async (userData) => {
  const { email } = userData;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error('Email already registered');
  }

  // Create user
  const user = await User.create(userData);

  // Generate tokens
  const token = generateToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, user.role);

  // Save refresh token in DB
  await User.findByIdAndUpdate(user._id, { refreshToken });

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    token,
    refreshToken
  };
};

// Login User/Customer/Admin
export const loginUser = async (email, password, requiredRole) => {
  const user = await User.findOne({ email }).select('+password');
  
  if (!user) {
    throw new Error('Invalid email or password');
  }

  // Check if the user's role matches the required role
  // Agar requiredRole 'customer' hai aur user 'admin' hai, toh block karein
  if (requiredRole && user.role !== requiredRole) {
    throw new Error(`Unauthorized: You are not a ${requiredRole}`);
  }

  if (!user.isActive) {
    throw new Error('Account is deactivated');
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new Error('Invalid email or password');
  }

  const token = generateToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, user.role);

  await User.findByIdAndUpdate(user._id, { refreshToken });

  return {
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
    token,
    refreshToken
  };
};

// Register Vendor
export const registerVendor = async (vendorData) => {
  const { email } = vendorData;

  // Check if vendor already exists
  const existingVendor = await Vendor.findOne({ email });
  if (existingVendor) {
    throw new Error('Email already registered');
  }

  // Create vendor with pending status
  const vendor = await Vendor.create(vendorData);

  // Generate tokens
  const token = generateToken(vendor._id, vendor.role);
  const refreshToken = generateRefreshToken(vendor._id, vendor.role);

  // Save refresh token in DB
  await Vendor.findByIdAndUpdate(vendor._id, { refreshToken });

  return {
    vendor: {
      id: vendor._id,
      name: vendor.name,
      email: vendor.email,
      businessName: vendor.businessName,
      role: vendor.role,
      status: vendor.status
    },
    token,
    refreshToken
  };
};

// Login Vendor
export const loginVendor = async (email, password) => {
  // Find vendor with password field
  const vendor = await Vendor.findOne({ email }).select('+password');
  
  if (!vendor) {
    throw new Error('Invalid email or password');
  }

  // Check vendor status
  if (vendor.status === 'rejected') {
    throw new Error('Your vendor account has been rejected');
  }

  if (vendor.status === 'pending') {
    throw new Error('Your vendor account is pending approval');
  }

  // Check if vendor is active
  if (!vendor.isActive) {
    throw new Error('Account is deactivated');
  }

  // Verify password
  const isPasswordValid = await vendor.comparePassword(password);
  if (!isPasswordValid) {
    throw new Error('Invalid email or password');
  }

  // Generate tokens
  const token = generateToken(vendor._id, vendor.role);
  const refreshToken = generateRefreshToken(vendor._id, vendor.role);

  // Save refresh token in DB
  await Vendor.findByIdAndUpdate(vendor._id, { refreshToken });

  return {
    vendor: {
      id: vendor._id,
      name: vendor.name,
      email: vendor.email,
      businessName: vendor.businessName,
      role: vendor.role,
      status: vendor.status
    },
    token,
    refreshToken
  };
};

// Admin Login (same as user login but checks for admin role)
export const loginAdmin = async (email, password) => {
  // Find admin user with password field
  const admin = await User.findOne({ email, role: 'admin' }).select('+password');
  
  if (!admin) {
    throw new Error('Invalid admin credentials');
  }

  // Check if admin is active
  if (!admin.isActive) {
    throw new Error('Account is deactivated');
  }

  // Verify password
  const isPasswordValid = await admin.comparePassword(password);
  if (!isPasswordValid) {
    throw new Error('Invalid admin credentials');
  }

  // Generate tokens
  const token = generateToken(admin._id, admin.role);
  const refreshToken = generateRefreshToken(admin._id, admin.role);

  // Save refresh token in DB
  await User.findByIdAndUpdate(admin._id, { refreshToken });

  return {
    admin: {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role
    },
    token,
    refreshToken
  };
};

// Refresh Access Token
export const refreshAccessToken = async (refreshToken) => {
  if (!refreshToken) throw new Error('Refresh token is required');

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  } catch {
    throw new Error('Invalid or expired refresh token');
  }

  // Find account and verify stored refresh token
  let account;
  if (decoded.role === 'vendor') {
    account = await Vendor.findById(decoded.userId).select('+refreshToken');
  } else {
    account = await User.findById(decoded.userId).select('+refreshToken');
  }

  if (!account || account.refreshToken !== refreshToken) {
    throw new Error('Invalid refresh token');
  }

  if (!account.isActive) throw new Error('Account is deactivated');

  // Issue new access token
  const newAccessToken = generateToken(account._id, account.role);

  return { token: newAccessToken };
};

// ─── Forgot Password: Send OTP ────────────────────────────────────────────────
export const sendOtpService = async (email) => {
  if (!email) throw Object.assign(new Error("Email is required"), { statusCode: 400 });

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) throw Object.assign(new Error("No account found with this email"), { statusCode: 404 });
  if (!user.isActive) throw Object.assign(new Error("Account is suspended"), { statusCode: 403 });

  // 6-digit OTP
  const otp = crypto.randomInt(100000, 999999).toString();

  user.otpCode = otp;
  user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  user.otpAttempts = 0;
  user.otpVerified = false;
  await user.save({ validateBeforeSave: false });

  const resend = getResend();
  await resend.emails.send({
    from: `PlantPure <${process.env.FROM_EMAIL }>`,
    to: user.email,
    subject: "Your Password Reset OTP",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9fafb;border-radius:12px;">
        <h2 style="color:#1e293b;margin-bottom:8px;">Password Reset Request</h2>
        <p style="color:#64748b;margin-bottom:24px;">Use the OTP below to reset your password. It expires in <strong>10 minutes</strong>.</p>
        <div style="background:#fff;border:2px dashed #3b82f6;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;">
          <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#1e40af;">${otp}</span>
        </div>
        <p style="color:#94a3b8;font-size:13px;">If you didn't request this, please ignore this email. Do not share this OTP with anyone.</p>
      </div>
    `,
  });

  return { message: "OTP sent to your email address" };
};

// ─── Forgot Password: Verify OTP ─────────────────────────────────────────────
export const verifyOtpService = async (email, otp) => {
  if (!email || !otp) throw Object.assign(new Error("Email and OTP are required"), { statusCode: 400 });

  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select("+otpCode +otpExpires +otpAttempts +otpVerified");

  if (!user) throw Object.assign(new Error("No account found with this email"), { statusCode: 404 });

  if (!user.otpCode || !user.otpExpires)
    throw Object.assign(new Error("No OTP requested. Please request a new one"), { statusCode: 400 });

  if (user.otpAttempts >= 5) {
    user.otpCode = undefined;
    user.otpExpires = undefined;
    user.otpAttempts = 0;
    await user.save({ validateBeforeSave: false });
    throw Object.assign(new Error("Too many failed attempts. Please request a new OTP"), { statusCode: 429 });
  }

  if (user.otpExpires < new Date()) {
    user.otpCode = undefined;
    user.otpExpires = undefined;
    user.otpAttempts = 0;
    await user.save({ validateBeforeSave: false });
    throw Object.assign(new Error("OTP has expired. Please request a new one"), { statusCode: 400 });
  }

  if (user.otpCode !== otp.toString()) {
    user.otpAttempts += 1;
    await user.save({ validateBeforeSave: false });
    const remaining = 5 - user.otpAttempts;
    throw Object.assign(new Error(`Invalid OTP. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining`), { statusCode: 400 });
  }

  // OTP correct — generate short-lived reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
  user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
  user.otpCode = undefined;
  user.otpExpires = undefined;
  user.otpAttempts = 0;
  user.otpVerified = true;
  await user.save({ validateBeforeSave: false });

  return { resetToken };
};

// ─── Forgot Password: Reset Password ─────────────────────────────────────────
export const resetPasswordService = async (resetToken, newPassword) => {
  if (!resetToken || !newPassword)
    throw Object.assign(new Error("Reset token and new password are required"), { statusCode: 400 });

  if (newPassword.length < 6)
    throw Object.assign(new Error("Password must be at least 6 characters"), { statusCode: 400 });

  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  }).select("+otpVerified");

  if (!user) throw Object.assign(new Error("Reset token is invalid or has expired"), { statusCode: 400 });
  if (!user.otpVerified) throw Object.assign(new Error("OTP not verified"), { statusCode: 403 });

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.otpVerified = false;
  await user.save();

  return { message: "Password reset successfully" };
};

