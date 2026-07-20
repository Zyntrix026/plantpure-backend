import express from "express";

import {
    getContacts,
    getMessages,
    sendMessage,
} from "./instagram.controller.js";

const router = express.Router();

router.get("/contact/:contactId", getContacts);
router.get("/contacts", getContacts);
router.get("/messages/:contactId", getMessages);
router.post("/reply", sendMessage);

export default router;