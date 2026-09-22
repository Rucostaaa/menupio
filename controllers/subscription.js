const User = require("../models/User");

const PLAN_VALUES = [
  "one-menu",
  "multi-menu",
  "standard-ad",
  "advanced-ad",
  "max-range-ad",
];
const INTERVAL_VALUES = ["monthly", "yearly"];
const STATUS_VALUES = [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "expired",
];

const getUser = async (userId) => {
  const user = await User.findById(userId);

  if (!user) {
    const error = new Error("User not found.");
    error.statusCode = 404;
    throw error;
  }

  return user;
};

const validateSubscription = (payload, partial = false) => {
  const errors = [];

  if (!partial || payload.plan !== undefined) {
    if (!PLAN_VALUES.includes(payload.plan)) {
      errors.push(`plan must be one of: ${PLAN_VALUES.join(", ")}`);
    }
  }

  if (!partial || payload.billingInterval !== undefined) {
    if (!INTERVAL_VALUES.includes(payload.billingInterval)) {
      errors.push("billingInterval must be monthly or yearly");
    }
  }

  if (!partial || payload.price !== undefined) {
    if (!Number.isFinite(Number(payload.price)) || Number(payload.price) < 0) {
      errors.push("price must be a non-negative number");
    }
  }

  if (payload.status !== undefined && !STATUS_VALUES.includes(payload.status)) {
    errors.push(`status must be one of: ${STATUS_VALUES.join(", ")}`);
  }

  const startsAt = payload.startsAt ? new Date(payload.startsAt) : null;
  const endsAt = payload.endsAt ? new Date(payload.endsAt) : null;

  if (payload.startsAt !== undefined && Number.isNaN(startsAt.getTime())) {
    errors.push("startsAt must be a valid date");
  }

  if (payload.endsAt !== undefined && Number.isNaN(endsAt.getTime())) {
    errors.push("endsAt must be a valid date");
  }

  if (startsAt && endsAt && endsAt <= startsAt) {
    errors.push("endsAt must be after startsAt");
  }

  if (
    payload.paymentMethod?.last4 !== undefined &&
    !/^\d{4}$/.test(String(payload.paymentMethod.last4))
  ) {
    errors.push("paymentMethod.last4 must contain exactly four digits");
  }

  return errors;
};

const sanitizeSubscription = (payload) => {
  const allowed = [
    "plan",
    "billingInterval",
    "price",
    "currency",
    "status",
    "startsAt",
    "endsAt",
    "autoRenew",
    "providerSubscriptionId",
    "cancelledAt",
  ];
  const subscription = {};

  allowed.forEach((field) => {
    if (payload[field] !== undefined) {
      subscription[field] = payload[field];
    }
  });

  if (payload.paymentMethod) {
    subscription.paymentMethod = {};
    [
      "provider",
      "providerPaymentMethodId",
      "brand",
      "last4",
      "expiryMonth",
      "expiryYear",
    ].forEach((field) => {
      if (payload.paymentMethod[field] !== undefined) {
        subscription.paymentMethod[field] = payload.paymentMethod[field];
      }
    });
  }

  return subscription;
};

exports.listSubscriptions = async (req, res) => {
  try {
    const user = await getUser(req.user._id);

    return res.status(200).json({
      success: true,
      subscriptions: user.subscriptions,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to list subscriptions.",
    });
  }
};

exports.getSubscription = async (req, res) => {
  try {
    const user = await getUser(req.user._id);
    const subscription = user.subscriptions.id(req.params.subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found.",
      });
    }

    return res.status(200).json({ success: true, subscription });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to get subscription.",
    });
  }
};

exports.createSubscription = async (req, res) => {
  try {
    const errors = validateSubscription(req.body);

    if (errors.length) {
      return res
        .status(400)
        .json({ success: false, message: errors.join("; ") });
    }

    const user = await getUser(req.user._id);
    const subscription = user.subscriptions.create(
      sanitizeSubscription(req.body),
    );

    user.subscriptions.push(subscription);
    await user.save();

    return res.status(201).json({
      success: true,
      message: "Subscription created successfully.",
      subscription,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to create subscription.",
    });
  }
};

exports.updateSubscription = async (req, res) => {
  try {
    const errors = validateSubscription(req.body, true);

    if (errors.length) {
      return res
        .status(400)
        .json({ success: false, message: errors.join("; ") });
    }

    const user = await getUser(req.user._id);
    const subscription = user.subscriptions.id(req.params.subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found.",
      });
    }

    const update = sanitizeSubscription(req.body);

    Object.entries(update).forEach(([key, value]) => {
      if (key === "paymentMethod") {
        subscription.paymentMethod = {
          ...subscription.paymentMethod?.toObject?.(),
          ...value,
        };
      } else {
        subscription[key] = value;
      }
    });

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Subscription updated successfully.",
      subscription,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to update subscription.",
    });
  }
};

exports.deleteSubscription = async (req, res) => {
  try {
    const user = await getUser(req.user._id);
    const subscription = user.subscriptions.id(req.params.subscriptionId);

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found.",
      });
    }

    subscription.deleteOne();
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Subscription deleted successfully.",
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to delete subscription.",
    });
  }
};

module.exports = {
  listSubscriptions: exports.listSubscriptions,
  getSubscription: exports.getSubscription,
  createSubscription: exports.createSubscription,
  updateSubscription: exports.updateSubscription,
  deleteSubscription: exports.deleteSubscription,
};
