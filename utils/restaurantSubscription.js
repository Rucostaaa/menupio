const Restaurant = require("../models/Restaurant");
const RestaurantSubscription = require("../models/RestaurantSubscription");
const SubscriptionPlan = require("../models/SubscriptionPlan");

const asDate = (seconds) =>
  Number.isFinite(seconds) ? new Date(seconds * 1000) : null;

const minorUnitsToMajor = (amount, currency) => {
  if (!Number.isFinite(amount)) return 0;
  try {
    const digits = new Intl.NumberFormat("en", {
      style: "currency",
      currency: String(currency || "eur").toUpperCase(),
    }).resolvedOptions().maximumFractionDigits;
    return amount / 10 ** digits;
  } catch {
    return amount / 100;
  }
};

const getPeriod = (subscription, field) =>
  subscription[field] ??
  subscription.items?.data?.[0]?.[field] ??
  null;

const syncRestaurantSubscription = async (stripeSubscription) => {
  const customerId =
    typeof stripeSubscription.customer === "string"
      ? stripeSubscription.customer
      : stripeSubscription.customer?.id;
  const restaurantId = stripeSubscription.metadata?.menupioRestaurantId;
  let restaurant = restaurantId
    ? await Restaurant.findById(restaurantId)
    : null;
  if (!restaurant && customerId) {
    restaurant = await Restaurant.findOne({
      "billing.stripeCustomerId": customerId,
    });
  }
  if (!restaurant) {
    throw new Error(
      `Restaurant not found for Stripe subscription ${stripeSubscription.id}.`,
    );
  }

  const item = stripeSubscription.items?.data?.[0];
  const stripePrice = item?.price;
  const priceId = typeof stripePrice === "string" ? stripePrice : stripePrice?.id;
  let planId = stripeSubscription.metadata?.menupioSubscriptionPlanId;
  if (!planId && priceId) {
    const plan = await SubscriptionPlan.findOne({ stripePriceId: priceId }).select("_id");
    planId = plan?._id;
  }
  const plan = planId ? await SubscriptionPlan.findById(planId).lean() : null;
  const currency = stripeSubscription.currency || stripePrice?.currency || "eur";
  const set = {
    restaurant: restaurant._id,
    plan: plan?._id || null,
    stripeCustomerId: customerId || restaurant.billing?.stripeCustomerId || null,
    stripeSubscriptionId: stripeSubscription.id,
    stripePriceId: priceId || null,
    status: stripeSubscription.status,
    currentPeriodStart: asDate(getPeriod(stripeSubscription, "current_period_start")),
    currentPeriodEnd: asDate(getPeriod(stripeSubscription, "current_period_end")),
    cancelAtPeriodEnd: Boolean(stripeSubscription.cancel_at_period_end),
    canceledAt: asDate(stripeSubscription.canceled_at),
    trialStart: asDate(stripeSubscription.trial_start),
    trialEnd: asDate(stripeSubscription.trial_end),
    currency: String(currency).toLowerCase(),
    amount: minorUnitsToMajor(stripePrice?.unit_amount, currency),
    interval: stripePrice?.recurring?.interval || plan?.interval || "month",
    intervalCount: stripePrice?.recurring?.interval_count || plan?.intervalCount || 1,
    metadata: stripeSubscription.metadata || {},
  };
  const planSnapshot = plan
    ? {
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        features: plan.features || {},
        limits: plan.limits || {},
      }
    : {};

  const existing = await RestaurantSubscription.findOne({
    stripeSubscriptionId: stripeSubscription.id,
  }).select("_id");
  const pendingCheckout = existing
    ? null
    : await RestaurantSubscription.findOne({
        restaurant: restaurant._id,
        status: "incomplete",
        stripeSubscriptionId: { $exists: false },
      })
        .sort({ createdAt: -1 })
        .select("_id");

  await Restaurant.updateOne(
    { _id: restaurant._id, "billing.stripeCustomerId": { $in: [null, customerId] } },
    { $set: { "billing.stripeCustomerId": customerId } },
  );

  await RestaurantSubscription.updateOne(
    existing
      ? { _id: existing._id }
      : pendingCheckout
        ? { _id: pendingCheckout._id }
        : { stripeSubscriptionId: stripeSubscription.id },
    {
      $set: plan ? { ...set, planSnapshot } : set,
      ...(plan ? {} : { $setOnInsert: { planSnapshot } }),
    },
    { upsert: !existing && !pendingCheckout, runValidators: true, setDefaultsOnInsert: true },
  );
  if (["active", "trialing"].includes(stripeSubscription.status)) {
    await RestaurantSubscription.updateMany(
      {
        restaurant: restaurant._id,
        amount: 0,
        stripeSubscriptionId: null,
        status: "active",
      },
      { $set: { status: "canceled", canceledAt: new Date() } },
    );
  }
  return RestaurantSubscription.findOne({
    stripeSubscriptionId: stripeSubscription.id,
  })
    .populate("plan")
    .lean();
};

module.exports = { syncRestaurantSubscription };
