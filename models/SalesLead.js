const mongoose = require("mongoose");

const salesLeadSchema = new mongoose.Schema(
  {
    restaurantName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    businessType: { type: String, trim: true, maxlength: 100 },
    address: { type: String, trim: true, maxlength: 500 },
    city: { type: String, trim: true, maxlength: 100 },
    country: { type: String, trim: true, maxlength: 100 },
    website: { type: String, trim: true, maxlength: 2048 },
    instagram: { type: String, trim: true, maxlength: 255 },
    facebook: { type: String, trim: true, maxlength: 2048 },
    phone: { type: String, trim: true, maxlength: 50 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    contactName: { type: String, trim: true, maxlength: 160 },
    notes: { type: String, trim: true, maxlength: 10000 },
    status: {
      type: String,
      enum: [
        "NEW",
        "CONTACTED",
        "INTERESTED",
        "DEMO",
        "PROPOSAL",
        "CUSTOMER",
        "LOST",
        "NO_RESPONSE",
      ],
      default: "NEW",
      index: true,
    },
    readAt: { type: Date, default: null, index: true },
    source: { type: String, trim: true, maxlength: 100, default: "manual" },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    nextAction: { type: String, trim: true, maxlength: 500 },
    nextFollowUpAt: { type: Date, default: null, index: true },
    followUpNote: { type: String, trim: true, maxlength: 4000 },
    lastContactAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

salesLeadSchema.index({ status: 1, updatedAt: -1 });
salesLeadSchema.index({ nextFollowUpAt: 1, status: 1 });
salesLeadSchema.index({ restaurantName: "text", city: "text", contactName: "text" });

module.exports =
  mongoose.models.SalesLead ||
  mongoose.model("SalesLead", salesLeadSchema);
