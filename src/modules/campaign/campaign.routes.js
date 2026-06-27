import express from 'express';
import {
  getAllCampaigns,
  getCampaignById,
  sendBulkCampaign,
  saveCampaignDraft,
  updateCampaignDraft,
  sendTestEmail,
  deleteCampaign,
  getCampaignStats,
} from './campaign.controller.js';
import { adminOnly } from '../../middleware/role.middleware.js';

const router = express.Router();

router.get('/stats',    adminOnly, getCampaignStats);
router.get('/',         adminOnly, getAllCampaigns);
router.get('/:id',      adminOnly, getCampaignById);
router.post('/send',    adminOnly, sendBulkCampaign);
router.post('/draft',   adminOnly, saveCampaignDraft);
router.post('/test',    adminOnly, sendTestEmail);
router.patch('/:id',    adminOnly, updateCampaignDraft);
router.delete('/:id',   adminOnly, deleteCampaign);

export default router;
