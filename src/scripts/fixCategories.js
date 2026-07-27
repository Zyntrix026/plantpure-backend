import mongoose from 'mongoose';
import { MONGO_URI } from '../config/env.js';
import { Category } from '../modules/categories/category.model.js';

const fixCategories = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    const result = await Category.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'Active' } }
    );

    // Show current state
    const all = await Category.find({}, { name: 1, status: 1 });
    console.log('Current categories:', all);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
};

fixCategories();
