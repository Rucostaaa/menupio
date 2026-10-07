const Stripe = require("stripe");
const mongoose = require("mongoose");
const RestaurantSubscription = require("../models/RestaurantSubscription");
const SubscriptionPlan = require("../models/SubscriptionPlan");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const PLAN_INTERVALS = ["day", "week", "month", "year"];
const PLAN_FIELDS = [
  "name",
  "slug",
  "description",
  "price",
  "currency",
  "interval",
  "intervalCount",
  "trialDays",
  "features",
  "limits",
  "active",
  "displayOrder",
  "badge",
  "metadata",
];

const normalizePlan = (body, current = {}) => {
  const plan = { ...current };
  if (!Object.keys(current).length) {
    Object.assign(plan, {
      currency: "eur",
      interval: "month",
      intervalCount: 1,
      trialDays: 0,
      features: {},
      limits: {},
      active: false,
      displayOrder: 0,
    });
  }
  for (const field of PLAN_FIELDS) {
    if (body[field] !== undefined) plan[field] = body[field];
  }
  if (plan.name !== undefined) plan.name = String(plan.name).trim();
  if (plan.slug !== undefined) {
    plan.slug = String(plan.slug)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }
  if (plan.description !== undefined) plan.description = String(plan.description || "").trim();
  if (plan.badge !== undefined) plan.badge = String(plan.badge || "").trim();
  if (plan.currency !== undefined) plan.currency = String(plan.currency).trim().toLowerCase();
  if (plan.price !== undefined) plan.price = Number(plan.price);
  if (plan.intervalCount !== undefined) plan.intervalCount = Number(plan.intervalCount);
  if (plan.trialDays !== undefined) plan.trialDays = Number(plan.trialDays);
  if (plan.displayOrder !== undefined) plan.displayOrder = Number(plan.displayOrder);
  return plan;
};

const validatePlan = (plan, partial = false) => {
  const errors = [];
  if ((!partial || plan.name !== undefined) && !plan.name) errors.push("Plan name is required.");
  if ((!partial || plan.slug !== undefined) && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(plan.slug || "")) {
    errors.push("Slug must contain lowercase letters, numbers and hyphens.");
  }
  if ((!partial || plan.price !== undefined) && (!Number.isFinite(plan.price) || plan.price < 0)) {
    errors.push("Price must be a non-negative number.");
  }
  if ((!partial || plan.currency !== undefined) && !/^[a-z]{3}$/.test(plan.currency || "")) {
    errors.push("Currency must be a three-letter ISO code.");
  }
  if (plan.currency && plan.price > 0) {
    try {
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: plan.currency.toUpperCase(),
      }).format(1);
    } catch {
      errors.push("Currency must be a supported ISO currency code.");
    }
  }
  if ((!partial || plan.interval !== undefined) && !PLAN_INTERVALS.includes(plan.interval)) {
    errors.push("Interval must be day, week, month or year.");
  }
  if ((!partial || plan.intervalCount !== undefined) &&
      (!Number.isInteger(plan.intervalCount) || plan.intervalCount < 1 ||
       plan.intervalCount > ({ day: 1095, week: 156, month: 36, year: 3 }[plan.interval] || 0))) {
    errors.push("Interval count is outside Stripe's supported range for this interval.");
  }
  if ((!partial || plan.trialDays !== undefined) &&
      (!Number.isInteger(plan.trialDays) || plan.trialDays < 0 || plan.trialDays > 730)) {
    errors.push("Trial days must be an integer between 0 and 730.");
  }
  if (plan.displayOrder !== undefined && !Number.isFinite(plan.displayOrder)) {
    errors.push("Display order must be a number.");
  }
  if (plan.active !== undefined && typeof plan.active !== "boolean") {
    errors.push("Active must be a boolean.");
  }
  for (const field of ["features", "limits", "metadata"]) {
    if (plan[field] !== undefined &&
        (!plan[field] || typeof plan[field] !== "object" || Array.isArray(plan[field]))) {
      errors.push(`${field} must be an object.`);
    }
  }
  if (plan.limits && typeof plan.limits === "object" && !Array.isArray(plan.limits)) {
    for (const [key, value] of Object.entries(plan.limits)) {
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
        errors.push(`Limit "${key}" must be a non-negative integer or null.`);
      }
    }
  }
  if (plan.price > 0 && /^[a-z]{3}$/.test(plan.currency || "")) {
    try {
      if (toStripeMinorUnits(plan.price, plan.currency) < 1) {
        errors.push("Paid plans must have a price of at least one minor currency unit.");
      }
    } catch (error) {
      errors.push(error.message);
    }
  }
  return errors;
};

const toStripeMinorUnits = (price, currency) => {
  const fractionDigits = new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).resolvedOptions().maximumFractionDigits;
  const multiplier = 10 ** fractionDigits;
  const minorAmount = Math.round(price * multiplier);
  if (Math.abs(price * multiplier - minorAmount) > 1e-7) {
    throw new Error(`Price supports at most ${fractionDigits} decimal places for ${currency.toUpperCase()}.`);
  }
  return minorAmount;
};

const toPlanResponse = (plan) => {
  const value = plan?.toObject ? plan.toObject() : plan;
  if (!value) return value;
  return {
    ...value,
    features: value.features || {},
    limits: value.limits || {},
    metadata: value.metadata || {},
  };
};

// Yearly billing: 12 months for the price of 10, only for monthly plans.
const YEARLY_PAYABLE_MONTHS = 10;

const syncYearlyPrice = async (plan, activate, recreate) => {
  const eligible = plan.interval === "month" && plan.intervalCount === 1;
  if (!eligible) {
    if (plan.stripeYearlyPriceId) {
      await stripe.prices.update(plan.stripeYearlyPriceId, { active: false });
      plan.stripeYearlyPriceId = null;
    }
    return;
  }
  if (plan.stripeYearlyPriceId && !recreate) {
    await stripe.prices.update(plan.stripeYearlyPriceId, { active: Boolean(activate) });
    return;
  }
  const version = plan.stripePriceVersion || 1;
  const created = await stripe.prices.create(
    {
      product: plan.stripeProductId,
      unit_amount: toStripeMinorUnits(plan.price * YEARLY_PAYABLE_MONTHS, plan.currency),
      currency: plan.currency,
      recurring: { interval: "year", interval_count: 1 },
      active: true,
      metadata: {
        menupioSubscriptionPlanId: String(plan._id),
        menupioBilling: "yearly",
      },
    },
    { idempotencyKey: `menupio-plan-yearly-price-${plan._id}-${version}` },
  );
  const usable = created.active
    ? created
    : await stripe.prices.update(created.id, { active: true });
  const oldId = plan.stripeYearlyPriceId;
  plan.stripeYearlyPriceId = usable.id;
  await plan.save();
  if (oldId && oldId !== usable.id) {
    await stripe.prices.update(oldId, { active: false });
  }
  if (!activate) {
    await stripe.prices.update(usable.id, { active: false });
  }
};

const syncPlanToStripe = async (plan, activate = plan.active) => {
  if (plan.price === 0) {
    if (plan.stripePriceId) {
      await stripe.prices.update(plan.stripePriceId, { active: false });
      plan.stripePriceId = null;
    }
    if (plan.stripeYearlyPriceId) {
      await stripe.prices.update(plan.stripeYearlyPriceId, { active: false });
      plan.stripeYearlyPriceId = null;
    }
    if (plan.stripeProductId) {
      await stripe.products.update(plan.stripeProductId, { active: false });
    }
    plan.stripeSyncStatus = "not_required";
    plan.stripeSyncError = null;
    return;
  }

  const amount = toStripeMinorUnits(plan.price, plan.currency);
  if (!plan.stripeProductId) {
    const product = await stripe.products.create(
      {
        name: plan.name,
        description: plan.description || undefined,
        active: Boolean(activate),
        metadata: { menupioSubscriptionPlanId: String(plan._id) },
      },
      { idempotencyKey: `menupio-plan-product-${plan._id}` },
    );
    plan.stripeProductId = product.id;
    await plan.save();
  } else {
    await stripe.products.update(plan.stripeProductId, {
      name: plan.name,
      description: plan.description || "",
      active: Boolean(activate),
    });
  }

  const priceNeedsCreating =
    !plan.stripePriceId ||
    plan.stripeSyncStatus !== "synced";
  if (priceNeedsCreating) {
    const version = plan.stripePriceVersion || 1;
    const newPrice = await stripe.prices.create(
      {
        product: plan.stripeProductId,
        unit_amount: amount,
        currency: plan.currency,
        recurring: {
          interval: plan.interval,
          interval_count: plan.intervalCount,
        },
        active: true,
        metadata: { menupioSubscriptionPlanId: String(plan._id) },
      },
      { idempotencyKey: `menupio-plan-price-${plan._id}-${version}` },
    );
    // An idempotent replay may return a price archived by an earlier attempt.
    const usablePrice = newPrice.active
      ? newPrice
      : await stripe.prices.update(newPrice.id, { active: true });
    const oldPriceId = plan.stripePriceId;
    plan.stripePriceId = usablePrice.id;
    plan.stripePriceVersion = version;
    await plan.save();
    await stripe.products.update(plan.stripeProductId, {
      default_price: usablePrice.id,
    });
    if (oldPriceId && oldPriceId !== usablePrice.id) {
      await stripe.prices.update(oldPriceId, { active: false });
    }
    if (!activate) {
      await stripe.prices.update(usablePrice.id, { active: false });
    }
  } else {
    await stripe.prices.update(plan.stripePriceId, {
      active: Boolean(activate),
    });
  }

  await syncYearlyPrice(plan, activate, priceNeedsCreating);

  plan.stripeSyncStatus = "synced";
  plan.stripeSyncError = null;
};

const withSubscriberCount = async (plan) => {
  const subscribers = await RestaurantSubscription.countDocuments({
    plan: plan._id,
    status: { $nin: ["canceled", "incomplete_expired"] },
  });
  return { ...toPlanResponse(plan), subscriberCount: subscribers };
};

exports.listPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ displayOrder: 1, createdAt: 1 }).lean();
    const result = await Promise.all(plans.map(withSubscriberCount));
    return res.json({ success: true, plans: result });
  } catch (error) {
    console.error("LIST SUBSCRIPTION PLANS ERROR:", error);
    return res.status(500).json({ success: false, message: "Could not load subscription plans." });
  }
};

exports.getPlan = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Plan ID is invalid." });
    }
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found." });
    return res.json({ success: true, plan: await withSubscriberCount(plan) });
  } catch (error) {
    console.error("GET SUBSCRIPTION PLAN ERROR:", error);
    return res.status(500).json({ success: false, message: "Could not load the subscription plan." });
  }
};

exports.createPlan = async (req, res) => {
  const data = normalizePlan(req.body || {});
  const errors = validatePlan(data);
  if (errors.length) return res.status(400).json({ success: false, message: errors.join(" ") });

  let plan;
  try {
    const requestedActive = Boolean(data.active);
    plan = new SubscriptionPlan({
      ...data,
      active: data.price === 0 && requestedActive,
    });
    if (plan.price > 0) plan.stripePriceVersion = 1;
    await plan.save();
    try {
      await syncPlanToStripe(plan, requestedActive);
    } catch (error) {
      plan.active = false;
      plan.stripeSyncStatus = "failed";
      plan.stripeSyncError = error.message;
      await plan.save();
      console.error("CREATE SUBSCRIPTION PLAN STRIPE SYNC ERROR:", error);
      return res.status(502).json({
        success: false,
        message: `Plan was saved inactive, but Stripe sync failed: ${error.message}`,
        plan: toPlanResponse(plan),
      });
    }
    plan.active = requestedActive;
    if (data.price > 0) plan.stripeSyncStatus = "synced";
    plan.stripeSyncError = null;
    await plan.save();
    return res.status(201).json({ success: true, plan: await withSubscriberCount(plan) });
  } catch (error) {
    console.error("CREATE SUBSCRIPTION PLAN ERROR:", error);
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "A plan with this slug already exists." });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Could not create the subscription plan." });
  }
};

exports.updatePlan = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Plan ID is invalid." });
  }
  const plan = await SubscriptionPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: "Plan not found." });
  if (plan.archivedAt) return res.status(409).json({ success: false, message: "Archived plans cannot be edited." });

  const currentValues = Object.fromEntries(
    PLAN_FIELDS.map((field) => [field, plan[field]]),
  );
  const data = normalizePlan(req.body || {}, currentValues);
  const errors = validatePlan(data, true);
  if (errors.length) return res.status(400).json({ success: false, message: errors.join(" ") });
  const pricingChanged = ["price", "currency", "interval", "intervalCount"].some(
    (field) => data[field] !== undefined && data[field] !== plan[field],
  );
  const requestedActive = data.active ?? plan.active;

  try {
    Object.assign(plan, data);
    if (pricingChanged && plan.price > 0) {
      plan.stripePriceVersion = (plan.stripePriceVersion || 0) + 1;
      plan.active = false;
      plan.stripeSyncStatus = "failed";
    }
    await plan.save();
    try {
      await syncPlanToStripe(plan, requestedActive);
    } catch (error) {
      plan.active = false;
      plan.stripeSyncStatus = "failed";
      plan.stripeSyncError = error.message;
      await plan.save();
      console.error("UPDATE SUBSCRIPTION PLAN STRIPE SYNC ERROR:", error);
      return res.status(502).json({
        success: false,
        message: `Plan was saved inactive, but Stripe sync failed: ${error.message}`,
        plan: toPlanResponse(plan),
      });
    }
    plan.active = requestedActive && !plan.archivedAt;
    plan.stripeSyncStatus = plan.price === 0 ? "not_required" : "synced";
    plan.stripeSyncError = null;
    await plan.save();
    return res.json({ success: true, plan: await withSubscriberCount(plan) });
  } catch (error) {
    console.error("UPDATE SUBSCRIPTION PLAN ERROR:", error);
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "A plan with this slug already exists." });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: "Could not update the subscription plan." });
  }
};

exports.updatePlanStatus = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Plan ID is invalid." });
  }
  if (typeof req.body?.active !== "boolean") {
    return res.status(400).json({ success: false, message: "Active must be a boolean." });
  }
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found." });
    if (plan.archivedAt && req.body.active) {
      return res.status(409).json({ success: false, message: "Archived plans cannot be reactivated." });
    }
    if (req.body.active && plan.price > 0 &&
        (!plan.stripePriceId || plan.stripeSyncStatus !== "synced")) {
      return res.status(409).json({ success: false, message: "Plan must be successfully synced with Stripe before activation." });
    }
    if (!req.body.active) {
      plan.active = false;
      await plan.save();
    }
    try {
      if (plan.price > 0 && plan.stripeProductId) {
        await stripe.products.update(plan.stripeProductId, { active: req.body.active });
      }
      if (plan.price > 0 && plan.stripePriceId) {
        await stripe.prices.update(plan.stripePriceId, { active: req.body.active });
      }
      if (plan.price > 0 && plan.stripeYearlyPriceId) {
        await stripe.prices.update(plan.stripeYearlyPriceId, { active: req.body.active });
      }
    } catch (error) {
      if (req.body.active) {
        plan.active = false;
        await plan.save();
      }
      throw error;
    }
    plan.active = req.body.active;
    await plan.save();
    return res.json({ success: true, plan: await withSubscriberCount(plan) });
  } catch (error) {
    console.error("UPDATE SUBSCRIPTION PLAN STATUS ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Could not update plan status." });
  }
};

exports.deletePlan = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Plan ID is invalid." });
  }
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found." });
    const liveSubscribers = await RestaurantSubscription.countDocuments({
      plan: plan._id,
      status: { $nin: ["canceled", "incomplete_expired"] },
    });
    if (liveSubscribers > 0) {
      return res.status(409).json({
        success: false,
        message: `This plan still has ${liveSubscribers} current subscriber(s) and cannot be deleted.`,
      });
    }
    // Stripe products with prices cannot be deleted, so they are deactivated.
    if (plan.price > 0) {
      for (const priceId of [plan.stripePriceId, plan.stripeYearlyPriceId]) {
        if (priceId) await stripe.prices.update(priceId, { active: false }).catch(() => {});
      }
      if (plan.stripeProductId) {
        await stripe.products.update(plan.stripeProductId, { active: false }).catch(() => {});
      }
    }
    await plan.deleteOne();
    return res.json({ success: true });
  } catch (error) {
    console.error("DELETE SUBSCRIPTION PLAN ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Could not delete the plan." });
  }
};

exports.archivePlan = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ success: false, message: "Plan ID is invalid." });
  }
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found." });
    plan.active = false;
    plan.archivedAt = plan.archivedAt || new Date();
    await plan.save();
    if (plan.stripeProductId && plan.price > 0) await stripe.products.update(plan.stripeProductId, { active: false });
    if (plan.stripePriceId && plan.price > 0) await stripe.prices.update(plan.stripePriceId, { active: false });
    if (plan.stripeYearlyPriceId && plan.price > 0) await stripe.prices.update(plan.stripeYearlyPriceId, { active: false });
    return res.json({ success: true, plan: await withSubscriberCount(plan) });
  } catch (error) {
    console.error("ARCHIVE SUBSCRIPTION PLAN ERROR:", error);
    return res.status(500).json({ success: false, message: error.message || "Could not archive the plan." });
  }
};
