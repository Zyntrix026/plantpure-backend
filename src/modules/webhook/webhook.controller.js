import { FBConversation, FBMessage } from '../facebook/facebook.model.js';
import { Message } from '../instagram/instagram.model.js';
import { getIO } from '../../config/socket.js';

export const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('Webhook Verified');
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

export const receiveWebhook = async (req, res) => {
  const body = req.body;

  // Always respond 200 immediately to Meta
  res.sendStatus(200);

  try {
    if (body.object === 'page') {
      for (const entry of body.entry || []) {
        for (const event of entry.messaging || []) {
          if (!event.message || event.message.is_echo) continue;

          const senderId = event.sender.id;
          const pageId = event.recipient.id;
          const msgData = event.message;

          // Find or create conversation
          let conversation = await FBConversation.findOne({ fbConversationId: entry.id });
          if (!conversation) {
            conversation = await FBConversation.create({
              fbConversationId: entry.id,
              pageId,
              participants: [{ id: senderId }],
              lastMessageAt: new Date(),
            });
          } else {
            await FBConversation.updateOne(
              { fbConversationId: entry.id },
              { $set: { lastMessageAt: new Date() } }
            );
          }

          // Save message
          const savedMessage = await FBMessage.findOneAndUpdate(
            { fbMessageId: msgData.mid },
            {
              $set: {
                fbConversationId: entry.id,
                sender: { id: senderId },
                messageText: msgData.text || '',
                attachments: msgData.attachments?.map((a) => ({
                  type: a.type,
                  payloadUrl: a.payload?.url || null,
                })) || [],
                timestamp: new Date(event.timestamp),
              },
            },
            { upsert: true, new: true }
          );

          // Emit to all connected admin clients
          getIO().emit('fb_new_message', {
            conversationId: entry.id,
            message: savedMessage,
          });

          console.log(`[SOCKET] Emitted fb_new_message for conversation: ${entry.id}`);
        }
      }
    }

    if (body.object === 'instagram') {
      for (const entry of body.entry || []) {
        for (const event of entry.messaging || []) {
          if (!event.message || event.message.is_echo) continue;

          const senderId = event.sender.id;
          const msgData = event.message;

          const savedMessage = await Message.findOneAndUpdate(
            { mid: msgData.mid },
            {
              $set: {
                senderId,
                text: msgData.text || '',
                attachments: msgData.attachments || [],
                createdTime: new Date(event.timestamp),
                conversationId: event.recipient.id,
              },
            },
            { upsert: true, new: true }
          );

          // Emit to all connected admin clients
          getIO().emit('ig_new_message', {
            senderId,
            message: savedMessage,
          });

          console.log(`[SOCKET] Emitted ig_new_message from sender: ${senderId}`);
        }
      }
    }
  } catch (error) {
    console.error('[WEBHOOK ERROR]', error.message);
  }
};
