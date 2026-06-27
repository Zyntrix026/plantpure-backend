import mongoose from "mongoose";
import { MONGO_URI } from "./env.js";

mongoose.set("bufferCommands", false);

const connectDB = async () => {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  if (mongoose.connection.readyState === 1) {
    return; // already connected, skip
  }

  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
  });

  console.log("MongoDB Connected Successfully");
};

export default connectDB;
