import mongoose from "mongoose";

const InquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email address is required"],
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address"],
    },
    mobile: {
      type: String,
      required: [true, "Mobile number is required"],
      trim: true,
      match: [/^\+?[0-9]{10,12}$/, "Please enter a valid 10 to 12 digit mobile number"],
    },
    productType: {
      type: String,
      required: [true, "Product selection is required"],
      enum: {
        values: [
          "Hibiscus Flower Oil",
          "Moringa Oil",
          "Organic Cold-Pressed Jojoba Seed Oil",
          "Color Secure Hair Cleanser",
          "Cleansing & Nourishing Hair Cleanser",
        ],
        message: "{VALUE} is not a valid product",
      },
    },
    quantity: {
      type: Number,
      required: [true, "Quantity is required"],
      min: [1, "Quantity must be at least 1"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      minlength: [10, "Message must be at least 10 characters long"],
      trim: true,
    },
    status: {
      type: String,
      enum: ["New", "Contacted", "Converted", "Ignored"],
      default: "New",
    },
    dataConsent: {
      type: Boolean,
      required: [true, "Data consent agreement is required"],
      validate: {
        validator: function (v) {
          return v === true;
        },
        message: "You must agree to data collection terms",
      },
    },
  },
  {
    timestamps: true,
  }
);

const Inquiry = mongoose.model("Inquiry", InquirySchema);
export default Inquiry;