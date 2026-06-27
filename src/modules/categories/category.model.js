import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Category name is required'], 
    trim: true,
  },
  slug: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true 
  },
  parentId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category', 
    default: null 
  },
  categoryImage: { type: String }, // Optional: Category icon
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' }
}, { timestamps: true });

export const Category = mongoose.model('Category', categorySchema);