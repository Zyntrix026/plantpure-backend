import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Campaign name is required"],
    trim: true
  },
  subject: {
    type: String,
    required: [true, "Subject line is required"],
    trim: true
  },
  emailContent: {
    type: String,
    default: ''
  },
  recipients: {
    type: [String],
    default: []
  },
  recipientCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Draft', 'Sent', 'Failed'],
    default: 'Draft'
  },
  sentAt: {
    type: Date
  },
  // track how many actually succeeded vs failed in a bulk send
  successCount: { type: Number, default: 0 },
  failCount:    { type: Number, default: 0 },
}, {
  timestamps: true
});

const Campaign = mongoose.model('Campaign', campaignSchema);
export default Campaign;
