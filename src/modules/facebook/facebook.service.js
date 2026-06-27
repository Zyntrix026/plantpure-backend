import axios from 'axios';

const META_BASE_URL = 'https://graph.facebook.com/v19.0';

/**
 * Fetches conversations from Meta using server env tokens
 */
export const fetchConversationsFromMeta = async (afterCursor = '') => {
  try {
    const pageId = process.env.FB_PAGE_ID;
    const pageAccessToken = process.env.FB_PAGE_ACCESS_TOKEN;

    const response = await axios.get(`${META_BASE_URL}/${pageId}/conversations`, {
      params: {
        access_token: pageAccessToken,
        fields: 'id,participants,updated_time',
        limit: 25,
        after: afterCursor || undefined,
      },
    });
    
    return {
      data: response.data.data || [],
      nextCursor: response.data.paging?.cursors?.after || null,
    };
  } catch (error) {
    throw new Error(`Meta Graph API Error (Conversations): ${error.response?.data?.error?.message || error.message}`);
  }
};

/**
 * Fetches messages from a thread using server env tokens
 */
export const fetchMessagesFromMeta = async (conversationId, afterCursor = '') => {
  try {
    const pageAccessToken = process.env.FB_PAGE_ACCESS_TOKEN;

    const response = await axios.get(`${META_BASE_URL}/${conversationId}/messages`, {
      params: {
        access_token: pageAccessToken,
        fields: 'id,message,from,created_time,attachments{type,payload}',
        limit: 50,
        after: afterCursor || undefined,
      },
    });

    return {
      data: response.data.data || [],
      nextCursor: response.data.paging?.cursors?.after || null,
    };
  } catch (error) {
    throw new Error(`Meta Graph API Error (Messages): ${error.response?.data?.error?.message || error.message}`);
  }
};

/**
 * Dispatches outbound responses using server env tokens
 */
export const sendMessageToMeta = async (recipientId, text) => {
  try {
    const pageId = process.env.FB_PAGE_ID;
    const pageAccessToken = process.env.FB_PAGE_ACCESS_TOKEN;

    const response = await axios.post(
      `${META_BASE_URL}/${pageId}/messages`,
      {
        recipient: { id: recipientId },
        message: { text },
        messaging_type: 'RESPONSE',
      },
      {
        params: { access_token: pageAccessToken },
      }
    );
    return response.data;
  } catch (error) {
    throw new Error(`Meta Send API Error: ${error.response?.data?.error?.message || error.message}`);
  }
};