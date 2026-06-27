import mongoose from 'mongoose';

const LegalPageSchema = new mongoose.Schema({
  pageKey: {
    type: String,
    required: true,
    unique: true,
    enum: ['privacy', 'refund', 'terms']
  },
  title: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Draft', 'Published'],
    default: 'Draft'
  },
  metaTitle: {
    type: String,
    trim: true,
    maxLength: 60
  },
  metaDescription: {
    type: String,
    trim: true,
    maxLength: 160
  }
}, {
  timestamps: true // Automates createdAt and updatedAt
});

const LegalPage = mongoose.model('LegalPage', LegalPageSchema);
export default LegalPage;