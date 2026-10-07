const mongoose = require("mongoose");

const restaurantSubscriptionSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      default: null,
      index: true,
    },
    stripeCustomerId: { type: String, default: null, index: true },
    stripeSubscriptionId: {
      type: String,
      unique: true,
      sparse: true,
    },
    stripeCheckoutSessionId: { type: String, default: null },
    stripePriceId: { type: String, default: null },
    status: {
      type: String,
      enum: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
        "incomplete_expired",
        "paused",
      ],
      required: true,
      default: "incomplete",
      index: true,
    },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    canceledAt: { type: Date, default: null },
    trialStart: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    currency: { type: String, lowercase: true, default: "eur" },
    amount: { type: Number, min: 0, default: 0 },
    interval: {
      type: String,
      enum: ["day", "week", "month", "year"],
      default: "month",
    },
    intervalCount: { type: Number, min: 1, default: 1 },
    planSnapshot: {
      name: { type: String, default: "" },
      slug: { type: String, default: "" },
      description: { type: String, default: "" },
      features: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
      limits: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true },
);

restaurantSubscriptionSchema.index({ restaurant: 1, status: 1, updatedAt: -1 });
restaurantSubscriptionSchema.index({ restaurant: 1, createdAt: -1 });

module.exports =
  mongoose.models.RestaurantSubscription ||
  mongoose.model("RestaurantSubscription", restaurantSubscriptionSchema);
