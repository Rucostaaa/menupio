const mongoose = require("mongoose");

const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      maxlength: 120,
      unique: true,
    },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    price: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
      default: "eur",
    },
    interval: {
      type: String,
      enum: ["day", "week", "month", "year"],
      default: "month",
    },
    intervalCount: { type: Number, min: 1, max: 1095, default: 1 },
    active: { type: Boolean, default: false },
    archivedAt: { type: Date, default: null },
    trialDays: { type: Number, min: 0, max: 730, default: 0 },
    features: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    limits: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    stripeProductId: { type: String, default: null, index: true },
    stripePriceId: { type: String, default: null, index: true },
    stripeYearlyPriceId: { type: String, default: null, index: true },
    stripePriceVersion: { type: Number, default: 0 },
    stripeSyncStatus: {
      type: String,
      enum: ["not_required", "synced", "failed"],
      default: "not_required",
    },
    stripeSyncError: { type: String, default: null, maxlength: 1000 },
    displayOrder: { type: Number, default: 0 },
    badge: { type: String, trim: true, maxlength: 80, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true },
);

subscriptionPlanSchema.index({ active: 1, archivedAt: 1, displayOrder: 1 });

module.exports =
  mongoose.models.SubscriptionPlan ||
  mongoose.model("SubscriptionPlan", subscriptionPlanSchema);
