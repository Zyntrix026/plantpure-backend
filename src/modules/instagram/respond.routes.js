import { Router } from 'express';
import { respondWebhook } from '../instagram/respond.webhook.controller.js';

const router = Router();

// respond.io will POST to this URL on every new message
// Configure in respond.io → Settings → Webhooks → Add Webhook URL
router.post('/webhook', respondWebhook);

export default router;
