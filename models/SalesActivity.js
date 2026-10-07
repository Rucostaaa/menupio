const mongoose = require("mongoose");

const salesActivitySchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesLead",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "NOTE",
        "EMAIL",
        "PHONE",
        "WHATSAPP",
        "DEMO",
        "PROPOSAL",
        "STATUS_CHANGE",
        "FOLLOW_UP_SCHEDULED",
      ],
      required: true,
    },
    content: { type: String, required: true, trim: true, maxlength: 5000 },
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
  { versionKey: false },
);

salesActivitySchema.index({ lead: 1, createdAt: -1 });

module.exports =
  mongoose.models.SalesActivity ||
  mongoose.model("SalesActivity", salesActivitySchema);
