import mongoose from "mongoose";
import User from "../modules/users/user.model.js";
import { MONGO_URI } from "../config/env.js";

export const createAdmin = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Database connected");

    // Naya Admin Data
    const adminData = {
      name: "Shahrukh Khan",
      email: "shahrukh@zyntrixptvltd.com",
      password: "Admin@123",
      role: "admin",
    };

    // FIX: Role ke bajaye EMAIL se check karein
    const existingAdmin = await User.findOne({ email: adminData.email });

    if (existingAdmin) {
      console.log("⚠️ This Admin Email already exists:", existingAdmin.email);
      await mongoose.connection.close();
      process.exit(0);
    }

    // Create naya admin
    const admin = await User.create(adminData);

    console.log("🚀 New Admin created successfully!");
    console.log("Email:", admin.email);
    console.log("Role:", admin.role);

    await mongoose.connection.close();
    console.log("🔌 Connection closed.");
    process.exit(0);

  } catch (error) {
    console.error("❌ Error creating admin:", error.message);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    process.exit(1);
  }
};

createAdmin();