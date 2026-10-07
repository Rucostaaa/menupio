const mongoose = require("mongoose");

const supportMessageSchema = new mongoose.Schema(
  {
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportTicket",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    senderRole: {
      type: String,
      enum: ["customer", "admin"],
      required: true,
    },
    body: {
      type: String,
      trim: true,
      required: true,
      maxlength: 4000,
    },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.SupportMessage ||
  mongoose.model("SupportMessage", supportMessageSchema);
