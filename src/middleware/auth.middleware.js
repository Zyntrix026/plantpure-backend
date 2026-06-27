import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../modules/users/user.model.js';
import Vendor from '../modules/vendors/vendor.model.js';
import { JWT_SECRET } from '../config/env.js';
import connectDB from '../config/db.js';

const ensureDB = async () => {
  if (mongoose.connection.readyState === 1) return;
  if (mongoose.connection.readyState === 2) {
    await new Promise((resolve, reject) => {
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
    });
    return;
  }
  await connectDB();
};

export const authenticate = async (req, res, next) => {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: 'JWT_SECRET is not configured.'
      });
    }

    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    await ensureDB();

    // Find user or vendor based on role
    const accountQuery =
      decoded.role === 'vendor'
        ? Vendor.findById(decoded.userId)
        : User.findById(decoded.userId);

    const account = await Promise.race([
      accountQuery,
      new Promise((_, reject) => {
        setTimeout(() => {
          const error = new Error('Authentication lookup timed out.');
          error.statusCode = 503;
          reject(error);
        }, 5000);
      })
    ]);

    if (!account) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Account not found.'
      });
    }

    // Check if account is active
    if (!account.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated.'
      });
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      account
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired.'
      });
    }

    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Authentication failed.'
    });
  }
};
