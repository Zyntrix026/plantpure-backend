import Lead from "./facebookLead.model.js";
import { fetchLeadDetails } from "./facebookService.js";

export const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.FACEBOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
};

export const receiveLead = async (req, res) => {
  try {
    const data = req.body;

    console.log("Poora Body Object:", JSON.stringify(data, null, 2));

    const name = data.name || data.full_name;
    const email = data.email || data.email_address;
    const phone = data.phone || data.contact_number;
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    if (!name && !email) {
      return res.status(400).send("No data received");
    }

    await Lead.create({ name, email, phone, facebookLeadId: "make-test" });

    console.log("Saved:", { name, email, phone });
    return res.status(200).send("Success");
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error");
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
