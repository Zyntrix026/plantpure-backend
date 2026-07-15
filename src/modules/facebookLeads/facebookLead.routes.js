import express from "express";
import Lead from "./facebookLead.model.js";
import { getAllLeads, sendMessage } from "./facebookLead.controller.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const leads = await Lead.find().sort({ createdAt: -1 });
  res.json(leads);
});

router.get("/get-leads", getAllLeads);

// Naya route message bhejne ke liye
router.post("/messages/send", sendMessage);

export default router;