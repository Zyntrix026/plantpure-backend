import axios from "axios";

export const fetchLeadDetails = async (leadId) => {
  const response = await axios.get(
    `https://graph.facebook.com/v23.0/${leadId}`,
    {
      params: { access_token: process.env.FACEBOOK_ACCESS_TOKEN },
    }
  );
  return response.data;
};

// Naya function: Tag ke sath message bhejne ke liye
export const sendFacebookMessage = async (recipientId, messageText, tag) => {
  const url = `https://graph.facebook.com/v23.0/me/messages`;

  // Payload structure ko dhyan se dekhein
  const payload = {
    recipient: { id: recipientId },
    message: { text: messageText }
  };

  if (tag) {
    payload.messaging_type = "MESSAGE_TAG";
    payload.tag = tag; 
  } else {
    payload.messaging_type = "RESPONSE";
  }

  const response = await axios.post(url, payload, {
    params: { access_token: process.env.FACEBOOK_ACCESS_TOKEN },
  });
  
  return response.data;
};