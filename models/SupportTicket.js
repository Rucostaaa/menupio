const mongoose = require("mongoose");

const supportTicketSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      required: true,
      maxlength: 100,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
      maxlength: 254,
    },
    guestAccessHash: {
      type: String,
      default: null,
      select: false,
    },
    subject: {
      type: String,
      trim: true,
      required: true,
      maxlength: 160,
    },
    category: {
      type: String,
      enum: ["general", "payments", "account", "technical"],
      default: "general",
      index: true,
    },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
      index: true,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true },
);

supportTicketSchema.index({ status: 1, lastMessageAt: -1 });

module.exports =
  mongoose.models.SupportTicket ||
  mongoose.model("SupportTicket", supportTicketSchema);
