import User from '../users/user.model.js';
import * as authService from './auth.service.js';
import { sendOtpService, verifyOtpService, resetPasswordService, generateToken, generateRefreshToken } from './auth.service.js';

// Register User/Customer
export const registerUser = async (req, res) => {
  try {
    const result = await authService.registerUser(req.body);
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Login User/Customer
export const loginCustomer = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Pass 'customer' as the required role
    const result = await authService.loginUser(email, password, 'customer');

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: result
    });
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
};

// Register Vendor
export const registerVendor = async (req, res) => {
  try {
    const result = await authService.registerVendor(req.body);
    res.status(201).json({
      success: true,
      message: 'Vendor registered successfully. Your account is pending approval.',
      data: result
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Login Vendor
export const loginVendor = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const result = await authService.loginVendor(email, password);
    res.status(200).json({
      success: true,
      message: 'Vendor login successful',
      data: result
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message
    });
  }
};

// Admin Login
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Pass 'admin' as the required role
    const result = await authService.loginUser(email, password, 'admin');

    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      data: result
    });
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
};

// Refresh Access Token
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }
    const result = await authService.refreshAccessToken(refreshToken);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(401).json({ success: false, message: error.message });
  }
};

// ==========================
// FORGOT PASSWORD (OTP Flow)
// ==========================

// POST /auth/forgot-password
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await sendOtpService(email);
    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// POST /auth/verify-otp
export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = await verifyOtpService(email, otp);
    res.status(200).json({ success: true, message: "OTP verified successfully", resetToken: result.resetToken });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// POST /auth/reset-password
export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    const result = await resetPasswordService(resetToken, newPassword);
    res.status(200).json({ success: true, message: result.message });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

// =======================
// USER PROFILE (Customer)
// =======================
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// =======================
// ADMIN PROFILE (System)
// =======================
export const getAdminProfile = async (req, res) => {
  try {
    // Yahan hum ensure karte hain ki role admin hi ho
    const admin = await User.findOne({ _id: req.user.userId, role: 'admin' }).select('-password');
    
    if (!admin) {
      return res.status(403).json({ success: false, message: "Unauthorized Admin Access" });
    }

    res.status(200).json({ success: true, data: admin });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// Google Auth (Login or Register)
export const googleAuth = async (req, res) => {
  try {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json({ success: false, message: "access_token is required" });
    }

    // Verify token with Google and get user info
    const googleRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!googleRes.ok) {
      return res.status(401).json({ success: false, message: "Invalid Google access token" });
    }

    const { sub: googleId, email, name, picture } = await googleRes.json();

    if (!email) {
      return res.status(400).json({ success: false, message: "Google account has no email" });
    }

    let user = await User.findOne({ email });

    if (user) {
      // Existing user — check if account is active
      if (!user.isActive) {
        return res.status(403).json({ success: false, message: "Account is deactivated" });
      }
      // Link Google ID if this user previously registered with email/password
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = "google";
        if (picture && !user.avatar?.includes("flaticon")) {
          user.avatar = picture;
        }
        await user.save({ validateBeforeSave: false });
      }
    } else {
      // New user — create account with Google data, no password needed
      user = await User.create({
        name,
        email,
        googleId,
        authProvider: "google",
        avatar: picture || "https://cdn-icons-png.flaticon.com/512/149/149071.png",
        role: "customer",
        isActive: true,
      });
    }

    // Generate tokens using the existing helpers (same as regular login)
    const token = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id, user.role);
    await User.findByIdAndUpdate(user._id, { refreshToken }, { returnDocument: 'after' });

    return res.status(200).json({
      success: true,
      message: "Google login successful",
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: picture || user.avatar,
        },
        token,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Google Auth Error:", error);
    return res.status(500).json({ success: false, message: "Google authentication failed", error: error.message });
  }
};