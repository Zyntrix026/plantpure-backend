import mongoose from "mongoose";

const leadSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    phone: String,

    pageId: String,
    leadgenId: String,

    source: {
      type: String,
      default: "Facebook Lead Ads",
    },

    status: {
      type: String,
      default: "New Lead",
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("facebookLead", leadSchema);
