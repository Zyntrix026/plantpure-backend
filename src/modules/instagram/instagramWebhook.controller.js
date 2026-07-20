// const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN;

// export const verifyInstagramWebhook = async (req, res) => {
//   try {
//     const mode = req.query["hub.mode"];
//     const token = req.query["hub.verify_token"];
//     const challenge = req.query["hub.challenge"];

//     if (mode === "subscribe" && token === VERIFY_TOKEN) {
//       console.log("✅ Instagram Webhook Verified");
//       return res.status(200).send(challenge);
//     }

//     return res.sendStatus(403);
//   } catch (error) {
//     console.log(error);
//     return res.sendStatus(500);
//   }
// };

// export const receiveInstagramWebhook = (req, res) => {
//   console.log("🔥 REAL WEBHOOK");
//   console.dir(req.body, { depth: null });

//   res.sendStatus(200);
// };


import { Message } from './instagram.model.js';

export const handleWebhook = async (req, res) => {
    try {
        const body = req.body;

        // Facebook verification (GET request)
        if (req.method === 'GET') {
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];
            if (mode && token === process.env.WEBHOOK_VERIFY_TOKEN) {
                return res.status(200).send(challenge);
            }
            return res.sendStatus(403);
        }

        // Processing Incoming Messages (POST request)
        if (body.object === 'instagram') {
            for (const entry of body.entry) {
                const webhookEvent = entry.messaging[0];
                const senderId = webhookEvent.sender.id;
                const messageData = webhookEvent.message;

                if (messageData) {
                    // DB mein save karo
                    const newMessage = await Message.create({
                        mid: messageData.mid,
                        senderId: senderId,
                        text: messageData.text || "",
                        attachments: messageData.attachments || [],
                        createdTime: new Date(),
                        conversationId: webhookEvent.recipient.id // Or thread ID mapping
                    });

                    // Yahan Socket.io emit karo (Global io instance access karo)
                    // req.io.emit('new_message', newMessage);
                }
            }
            return res.status(200).send('EVENT_RECEIVED');
        }
    } catch (error) {
        console.error("Webhook Error:", error);
        res.status(500).send("Internal Server Error");
    }
};