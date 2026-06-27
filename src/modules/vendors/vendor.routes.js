import express from 'express';
import * as vendorController from './vendor.controller.js';
import { adminOnly } from '../../middleware/role.middleware.js';

const router = express.Router();

// Admin routes for vendor management
router.get('/', adminOnly, vendorController.getAllVendors);
router.get('/:id', adminOnly, vendorController.getVendorById);
router.patch('/:id/approve', adminOnly, vendorController.approveVendor);
router.patch('/:id/reject', adminOnly, vendorController.rejectVendor);
router.patch('/:id/status', adminOnly, vendorController.updateVendorStatus);

export default router;
