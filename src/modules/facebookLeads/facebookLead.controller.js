import Lead from "./facebookLead.model.js";
import { fetchLeadDetails, sendFacebookMessage } from "./facebookService.js";

// ... verifyWebhook aur receiveLead function waisa hi rahega ...

export const sendMessage = async (req, res) => {
  try {
    const { recipientId, messageText, tag } = req.body;
    
    // Service call karein
    const data = await sendFacebookMessage(recipientId, messageText, tag);
    
    return res.status(200).json({ success: true, data });
  } catch (error) {
    // console.error("Message Error:", error.response?.data || error.message);
    console.log("Meta API Response:", JSON.stringify(error.response?.data, null, 2));
    return res.status(500).json({ 
      success: false, 
      message: error.response?.data?.error?.message || "Failed" 
    });
  }
};

export const getAllLeads = async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 }); 
    res.status(200).json(leads);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch leads" });
  }
};