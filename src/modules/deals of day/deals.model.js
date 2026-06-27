import mongoose from 'mongoose';

const dealsOfTheDaySchema = new mongoose.Schema({
  // --- LEFT SIDE CONTENT (Banner) ---
  title: { 
    type: String, 
    required: [true, 'Section title is required'], 
    default: "Deals Of The Day"
  },
  bannerImage: {
    url: { type: String, required: true },
    alt: { type: String, default: 'Deals Banner' }
  },
  buttonText: { 
    type: String, 
    default: "View All" 
  },
  
  // Yahan humne Category model ko refer kiya hai
  linkedCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, "Please link a category for the button"]
  },

  // --- RIGHT SIDE PRODUCTS (Manual Selection) ---
  selectedProducts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }
  ],

  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const DealsOfTheDay = mongoose.model('DealsOfTheDay', dealsOfTheDaySchema);