import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: false,
      select: false,
      minlength: 6,
    },
    avatar: {
      type: String,
      default: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
    },
    googleId: { type: String, select: false },
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    gender: {
      type: String,
      enum: ["male", "female", "other", "not specified"],
      default: "not specified",
    },
    role: {
      type: String,
      enum: ["customer", "admin"],
      default: "customer",
    },
    phone: {
      type: String,
      trim: true,
    },
    // Array of addresses taaki user multiple locations save kar sake
    addresses: [
      {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
        isDefault: { type: Boolean, default: false },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    refreshToken: {
      type: String,
      select: false,
    },
    // OTP based password reset
    otpCode: { type: String, select: false },
    otpExpires: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    otpVerified: { type: Boolean, default: false, select: false },
    // Security ke liye reset tokens
    passwordResetToken: String,
    passwordResetExpires: Date,
  },
  {
    timestamps: true,
  },
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
