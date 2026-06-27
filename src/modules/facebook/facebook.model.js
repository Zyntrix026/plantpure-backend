import mongoose from 'mongoose';

const FacebookConversationSchema = new mongoose.Schema(
  {
    fbConversationId: { type: String, required: true, unique: true, index: true },
    pageId: { type: String, required: true, index: true },
    participants: [
      {
        id: { type: String, required: true },
        name: { type: String },
        email: { type: String },
      },
    ],
    lastMessageAt: { type: Date, required: true },
    nextPageToken: { type: String, default: null },
  },
  { timestamps: true }
);

const FacebookMessageSchema = new mongoose.Schema(
  {
    fbMessageId: { type: String, required: true, unique: true, index: true },
    fbConversationId: { type: String, required: true, index: true },
    sender: {
      id: { type: String, required: true },
      name: { type: String },
    },
    messageText: { type: String },
    attachments: [
      {
        type: { type: String }, // image, video, file
        payloadUrl: { type: String },
      },
    ],
    timestamp: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// Compound index for optimal dashboard timeline rendering
FacebookMessageSchema.index({ fbConversationId: 1, timestamp: -1 });

export const FBConversation = mongoose.model('FacebookConversation', FacebookConversationSchema);
export const FBMessage = mongoose.model('FacebookMessage', FacebookMessageSchema);