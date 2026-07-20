import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    mid: { type: String, unique: true, required: true }, // Graph API Message ID
    senderId: String,
    text: String,
    attachments: Array,
    createdTime: Date,
    conversationId: { type: String, index: true }
}, { timestamps: true });

const conversationSchema = new mongoose.Schema({
    threadId: { type: String, unique: true, required: true },
    participants: Array,
    lastMessage: String,
    updatedAt: Date
});

export const Message = mongoose.model('InstagramMessage', messageSchema);
export const Conversation = mongoose.model('InstagramConversation', conversationSchema);