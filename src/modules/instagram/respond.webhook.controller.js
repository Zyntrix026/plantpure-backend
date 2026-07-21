import { getIO } from '../../config/socket.js';

/**
 * respond.io sends a POST to this endpoint whenever a new message arrives
 * on any channel (Instagram, WhatsApp, etc.)
 * Configure this URL in respond.io → Settings → Webhooks
 * URL: https://api.plantpure.in/api/respond/webhook
 */
export const respondWebhook = async (req, res) => {
  // Always ack immediately so respond.io doesn't retry
  res.sendStatus(200);

  try {
    const payload = req.body;

    // respond.io webhook payload shape:
    // { event: "message.created", contact: {...}, message: {...}, channel: {...} }
    const event = payload?.event;

    if (event === 'message.created' || event === 'message.received') {
      const contact = payload.contact || {};
      const message = payload.message || {};
      const channel = payload.channel || {};

      const normalizedMessage = {
        messageId: message.id || message.messageId,
        contactId: String(contact.id || ''),
        contactName: contact.name || contact.firstName || 'User',
        contactProfilePic: contact.profilePic || null,
        text: message.text || message?.message?.text || '',
        traffic: message.traffic || 'incoming',
        channelId: channel.id || message.channelId || null,
        channelType: channel.type || 'instagram',
        timestamp: message.createdAt || new Date().toISOString(),
        raw: message,
      };

      // Emit to all connected admin clients instantly
      getIO().emit('ig_new_message', {
        contactId: normalizedMessage.contactId,
        message: normalizedMessage,
      });

      console.log(`[RESPOND-WEBHOOK] Emitted ig_new_message for contact: ${normalizedMessage.contactId}`);
    }
  } catch (err) {
    console.error('[RESPOND-WEBHOOK ERROR]', err.message);
  }
};
