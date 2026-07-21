import * as fbService from './facebook.service.js';
import { FBConversation, FBMessage } from './facebook.model.js';
import { getIO } from '../../config/socket.js';

/**
 * 1. SYNC Conversations (Meta to MongoDB)
 * POST /api/v1/facebook/sync/conversations
 */
export const syncConversations = async (req, res, next) => {
  const { cursor } = req.query;
  const pageId = process.env.FB_PAGE_ID;

  try {
    console.log(`[FB-CRM-SYNC] Fetching conversations via ENV configs...`);
    const { data: fbConversations, nextCursor } = await fbService.fetchConversationsFromMeta(cursor);

    console.log(`[FB-CRM-SYNC] Meta returned ${fbConversations.length} conversation threads.`);

    const bulkOps = fbConversations.map((conv) => {
      const finalConvId = conv.id; 
      
      return {
        updateOne: {
          filter: { fbConversationId: finalConvId },
          update: {
            $set: {
              pageId,
              participants: conv.participants?.data || [],
              lastMessageAt: conv.updated_time ? new Date(conv.updated_time) : new Date(),
              nextPageToken: nextCursor,
            },
          },
          upsert: true,
        },
      };
    });

    if (bulkOps.length > 0) {
      const result = await FBConversation.bulkWrite(bulkOps);
      console.log(`[FB-CRM-SYNC] Upserted rows inside MongoDB: ${result.upsertedCount || result.modifiedCount}`);
    }

    return res.status(200).json({ 
      success: true, 
      count: fbConversations.length, 
      nextCursor 
    });
  } catch (error) {
    console.error(`[FB-CRM-ERROR] Sync Conversations Failed: ${error.message}`);
    return next(error);
  }
};

/**
 * 2. SYNC Messages for a specific thread (Meta to MongoDB)
 * POST /api/v1/facebook/sync/conversations/:conversationId/messages
 */
export const syncMessages = async (req, res, next) => {
  const { conversationId } = req.params;
  const { cursor } = req.query;

  try {
    console.log(`[FB-CRM-SYNC] Extracting messages for Target Thread ID: ${conversationId}`);
    const { data: fbMessages, nextCursor } = await fbService.fetchMessagesFromMeta(conversationId, cursor);

    const bulkOps = fbMessages.map((msg) => {
      const parsedAttachments = msg.attachments?.data?.map((att) => ({
        type: att.type,
        payloadUrl: att.payload?.url || null,
      })) || [];

      return {
        updateOne: {
          filter: { fbMessageId: msg.id },
          update: {
            $set: {
              fbConversationId: conversationId,
              sender: { id: msg.from?.id, name: msg.from?.name },
              messageText: msg.message || '',
              attachments: parsedAttachments,
              timestamp: msg.created_time ? new Date(msg.created_time) : new Date(),
            },
          },
          upsert: true,
        },
      };
    });

    if (bulkOps.length > 0) {
      await FBMessage.bulkWrite(bulkOps);
      console.log(`[FB-CRM-SYNC] Successfully synced ${bulkOps.length} messages inside DB.`);
    }

    await FBConversation.updateOne({ fbConversationId: conversationId }, { $set: { nextPageToken: nextCursor } });

    return res.status(200).json({ success: true, count: bulkOps.length, nextCursor });
  } catch (error) {
    console.error(`[FB-CRM-ERROR] Sync Messages Failed: ${error.message}`);
    return next(error);
  }
};

/**
 * 3. READ Database Conversations (Dashboard Fetching)
 * GET /api/v1/facebook/conversations
 */
export const getLocalConversations = async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 20;
  const page = parseInt(req.query.page, 10) || 1;
  const pageId = process.env.FB_PAGE_ID;

  try {
    const skip = (page - 1) * limit;
    const filter = { pageId };

    const [conversations, total] = await Promise.all([
      FBConversation.find(filter).sort({ lastMessageAt: -1 }).skip(skip).limit(limit).lean(),
      FBConversation.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: conversations,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * 4. READ Database Messages (Dashboard Thread Rendering)
 * GET /api/v1/facebook/conversations/:conversationId/messages
 */
export const getLocalMessages = async (req, res, next) => {
  const { conversationId } = req.params;
  const limit = parseInt(req.query.limit, 10) || 50;
  const page = parseInt(req.query.page, 10) || 1;

  try {
    const skip = (page - 1) * limit;
    const filter = { fbConversationId: conversationId };

    const [messages, total] = await Promise.all([
      FBMessage.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      FBMessage.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: messages.reverse(),
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * 5. WRITE Outbound Manual Response (Send Message)
 * POST /api/v1/facebook/messages/send
 */
export const sendMessage = async (req, res, next) => {
  const { recipientId, messageText, conversationId } = req.body;
  const pageId = process.env.FB_PAGE_ID;

  if (!recipientId || !messageText) {
    return res.status(400).json({ success: false, message: 'Missing recipientId or messageText in request body.' });
  }

  try {
    console.log(`[FB-CRM-OUTBOUND] Sending response to recipient: ${recipientId}`);
    const metaResponse = await fbService.sendMessageToMeta(recipientId, messageText);

    const savedMessage = await FBMessage.create({
      fbMessageId: metaResponse.message_id,
      fbConversationId: conversationId || `fallback-${recipientId}`,
      sender: { id: pageId, name: 'Page Agent' },
      messageText,
      attachments: [],
      timestamp: new Date(),
    });

    if (conversationId) {
      await FBConversation.updateOne({ fbConversationId: conversationId }, { $set: { lastMessageAt: new Date() } });
    }

    // Emit to all admin clients so sender sees message instantly
    try {
      getIO().emit('fb_new_message', {
        conversationId: conversationId || `fallback-${recipientId}`,
        message: savedMessage,
      });
    } catch (_) {}

    return res.status(201).json({ success: true, data: savedMessage });
  } catch (error) {
    console.error(`[FB-CRM-ERROR] Send Outbound Message Failed: ${error.message}`);
    return next(error);
  }
};