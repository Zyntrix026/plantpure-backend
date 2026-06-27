import { authenticate } from './auth.middleware.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';

// Optional auth — token hai to user set karo, nahi hai to guest allow karo
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');
    if (scheme === 'Bearer' && token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = { userId: decoded.userId, role: decoded.role };
    } else {
      req.user = null;
    }
    next();
  } catch {
    req.user = null;
    next();
  }
};

// Admin only access
export const adminOnly = [
  authenticate,
  (req, res, next) => {
    // console.log("Authenticated user in adminOnly middleware:", req.user);
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin only.'
      });
    }
    next();
  }
];

// Vendor only access
export const vendorOnly = [
  authenticate,
  (req, res, next) => {
    if (req.user.role !== 'vendor') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Vendor only.'
      });
    }
    next();
  }
];

// Authenticated user (customer) only
export const authenticatedUser = [
  authenticate,
  (req, res, next) => {
    if (req.user.role !== 'customer') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Customer only.'
      });
    }
    next();
  }
];

// Any authenticated account (admin, vendor, or customer)
export const anyAuthenticated = authenticate;
