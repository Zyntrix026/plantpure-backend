import mongoose from 'mongoose';
import { MONGO_URI } from '../config/env.js';
import { Category } from '../modules/categories/category.model.js';

const fixCategories = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Database connected');

    // Fix old docs that have no status field (set them to Active)
    const result = await Category.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'Active' } }
    );

    console.log(`Fixed ${result.modifiedCount} old categories`);

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
