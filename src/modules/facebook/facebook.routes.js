import { Router } from 'express';
import {
  syncConversations,
  syncMessages,
  getLocalConversations,
  getLocalMessages,
  sendMessage,
} from './facebook.controller.js';

const router = Router();

// Sync endpoints triggered by Dashboard Refresh buttons or Automated CRON routines
router.post('/sync/conversations', syncConversations);
router.post('/sync/conversations/:conversationId/messages', syncMessages);

// Database delivery routes serving UI Admin Panels directly
router.get('/conversations', getLocalConversations);
router.get('/conversations/:conversationId/messages', getLocalMessages);

// Action Dispatches
router.post('/messages/send', sendMessage);

export default router;