import axios from "axios";

export const fetchLeadDetails = async (leadId) => {
  const response = await axios.get(
    `https://graph.facebook.com/v23.0/${leadId}`,
    {
      params: {
        access_token: process.env.FACEBOOK_ACCESS_TOKEN,
      },
    },
  );

  return response.data;
};
