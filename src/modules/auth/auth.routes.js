import express from 'express';
import * as authController from './auth.controller.js';
import { forgotPassword, verifyOtp, resetPassword } from './auth.controller.js';
import { adminOnly, authenticatedUser } from '../../middleware/role.middleware.js';

const router = express.Router();

// User/Customer routes
router.post('/user/register', authController.registerUser);
router.post('/user/login', authController.loginCustomer);
router.get('/user/profile', authenticatedUser, authController.getUserProfile);
router.post("/google", authController.googleAuth);

// Vendor routes
router.post('/vendor/register', authController.registerVendor);
router.post('/vendor/login', authController.loginVendor);

// Admin routes
router.post('/admin/login', authController.loginAdmin);
router.get('/admin/profile', adminOnly, authController.getAdminProfile);

// Refresh token
router.post('/refresh-token', authController.refreshToken);

// Forgot Password (OTP flow)
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

export default router;
