import app from "../src/app.js";
import connectDB from "../src/config/db.js";
import mongoose from "mongoose";

const ensureDBConnected = async () => {
  // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  if (mongoose.connection.readyState === 1) return;
  if (mongoose.connection.readyState === 2) {
    // already connecting, wait for it
    await new Promise((resolve, reject) => {
      mongoose.connection.once("connected", resolve);
      mongoose.connection.once("error", reject);
    });
    return;
  }
  await connectDB();
};

export default async function handler(req, res) {
  await ensureDBConnected();
  return app(req, res);
}
