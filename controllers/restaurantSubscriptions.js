const Stripe = require("stripe");
const mongoose = require("mongoose");
const Restaurant = require("../models/Restaurant");
const RestaurantSubscription = require("../models/RestaurantSubscription");
const SubscriptionPlan = require("../models/SubscriptionPlan");
const { syncRestaurantSubscription } = require("../utils/restaurantSubscription");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const CURRENT_STATUSES = ["trialing", "active", "past_due", "unpaid", "incomplete", "paused"];

const getOwnedRestaurant = async (userId, restaurantId) => {
  const query = { owner: userId };
  if (restaurantId) query._id = restaurantId;
  const restaurant = await Restaurant.findOne(query);
  if (!restaurant) {
    const error = new Error("Owned restaurant not found.");
    error.statusCode = restaurantId ? 404 : 403;
    throw error;
  }
  return restaurant;
};

const planResponse = (plan) => {
  const value = plan?.toObject ? plan.toObject() : plan;
  if (!value) return value;
  return {
    ...value,
    features: value.features || {},
    limits: value.limits || {},
    metadata: value.metadata || {},
    yearlyPrice: value.stripeYearlyPriceId ? yearlyAmount(value) : null,
  };
};

const YEARLY_PAYABLE_MONTHS = 10;
const yearlyAmount = (plan) =>
  Math.round(plan.price * YEARLY_PAYABLE_MONTHS * 100) / 100;

// Resolves the Stripe price, amount and interval for the chosen billing cycle.
const resolveBilling = (plan, billing) => {
  if (billing === "yearly") {
    if (!plan.stripeYearlyPriceId) return null;
    return {
      priceId: plan.stripeYearlyPriceId,
      amount: yearlyAmount(plan),
      interval: "year",
      intervalCount: 1,
    };
  }
  return {
    priceId: plan.stripePriceId,
    amount: plan.price,
    interval: plan.interval,
    intervalCount: plan.intervalCount,
  };
};

exports.getPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({
      active: true,
      archivedAt: null,
      $or: [{ price: 0 }, { stripeSyncStatus: "synced", stripePriceId: { $ne: null } }],
    })
      .sort({ displayOrder: 1, createdAt: 1 })
      .lean();
    return res.json({ success: true, plans: plans.map(planResponse) });
  } catch (error) {
    console.error("GET ACTIVE SUBSCRIPTION PLANS ERROR:", error);
    return res.status(500).json({ success: false, message: "Could not load available plans." });
  }
};

const BASIC_PLAN_ID = process.env.BASIC_PLAN_ID || "6ac5e0b3e7007079658587a0";
const ACCESS_STATUSES = ["trialing", "active", "past_due"];

// A user is on the basic tier when none of their restaurants has a paid
// (non-basic) current subscription.
exports.getAccess = async (req, res) => {
  try {
    const restaurants = await Restaurant.find({ owner: req.user._id }).select("_id").lean();
    const subscriptions = await RestaurantSubscription.find({
      restaurant: { $in: restaurants.map((item) => item._id) },
      status: { $in: ACCESS_STATUSES },
    })
      .select("plan")
      .lean();
    const basic = !subscriptions.some(
      (item) => item.plan && String(item.plan) !== BASIC_PLAN_ID,
    );
    return res.json({ success: true, basic });
  } catch (error) {
    console.error("GET SUBSCRIPTION ACCESS ERROR:", error);
    return res.status(500).json({ success: false, message: "Could not load plan access." });
  }
};

exports.getCurrent = async (req, res) => {
  try {
    if (req.query.restaurantId && !mongoose.isValidObjectId(req.query.restaurantId)) {
      return res.status(400).json({ success: false, message: "Restaurant ID is invalid." });
    }
    const restaurant = await getOwnedRestaurant(req.user._id, req.query.restaurantId);
    const subscriptions = await RestaurantSubscription.find({ restaurant: restaurant._id })
      .populate("plan")
      .sort({ createdAt: -1 })
      .lean();
    const priority = (item) =>
      ["active", "trialing", "past_due", "unpaid", "paused"].includes(item.status) ? 0 : 1;
    const currentIndex = subscriptions
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => CURRENT_STATUSES.includes(item.status))
      .sort((a, b) => priority(a.item) - priority(b.item) || a.index - b.index)[0]?.index ?? -1;
    const current = currentIndex >= 0 ? subscriptions.splice(currentIndex, 1)[0] : null;
    return res.json({
      success: true,
      restaurant: { _id: restaurant._id, name: restaurant.name },
      subscription: current,
      history: subscriptions,
    });
  } catch (error) {
    console.error("GET CURRENT RESTAURANT SUBSCRIPTION ERROR:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Could not load the restaurant subscription.",
    });
  }
};

exports.createCheckout = async (req, res) => {
  let checkoutLockRestaurantId;
  try {
    const { restaurantId, planId, billing = "monthly" } = req.body || {};
    if (!["monthly", "yearly"].includes(billing)) {
      return res.status(400).json({ success: false, message: "Billing cycle is invalid." });
    }
    if (!restaurantId || !planId) {
      return res.status(400).json({
        success: false,
        message: "Restaurant and plan are required.",
      });
    }
    if (!mongoose.isValidObjectId(restaurantId) || !mongoose.isValidObjectId(planId)) {
      return res.status(400).json({
        success: false,
        message: "Restaurant ID or plan ID is invalid.",
      });
    }
    const ownedRestaurant = await getOwnedRestaurant(req.user._id, restaurantId);
    const lockAt = new Date();
    const restaurant = await Restaurant.findOneAndUpdate(
      {
        _id: ownedRestaurant._id,
        owner: req.user._id,
        $or: [
          { "billing.checkoutLockAt": null },
          { "billing.checkoutLockAt": { $exists: false } },
          {
            "billing.checkoutLockAt": {
              $lt: new Date(Date.now() - 5 * 60 * 1000),
            },
          },
        ],
      },
      { $set: { "billing.checkoutLockAt": lockAt } },
      { new: true },
    );
    if (!restaurant) {
      return res.status(409).json({
        success: false,
        message: "A subscription checkout is already being prepared for this restaurant.",
      });
    }
    checkoutLockRestaurantId = restaurant._id;
    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      active: true,
      archivedAt: null,
    });
    if (!plan || (plan.price > 0 &&
        (plan.stripeSyncStatus !== "synced" || !plan.stripePriceId))) {
      return res.status(404).json({
        success: false,
        message: "This plan is unavailable.",
      });
    }
    const cycle = plan.price > 0 ? resolveBilling(plan, billing) : null;
    if (plan.price > 0 && !cycle) {
      return res.status(409).json({
        success: false,
        message: "Yearly billing is not available for this plan.",
      });
    }

    const existingSubscription = await RestaurantSubscription.findOne({
      restaurant: restaurant._id,
      status: { $in: CURRENT_STATUSES },
      ...(plan.price > 0
        ? { $nor: [{ amount: 0, stripeSubscriptionId: null, status: "active" }] }
        : {}),
    }).sort({ createdAt: -1 });
    if (existingSubscription) {
      return res.status(409).json({
        success: false,
        message: "This restaurant already has a current or pending subscription.",
      });
    }

    if (plan.price === 0) {
      const subscription = await RestaurantSubscription.create({
        restaurant: restaurant._id,
        plan: plan._id,
        status: "active",
        currency: plan.currency,
        amount: 0,
        interval: plan.interval,
        intervalCount: plan.intervalCount,
        planSnapshot: {
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          features: plan.features || {},
          limits: plan.limits || {},
        },
        metadata: { source: "free_plan_selection" },
      });
      return res.status(201).json({
        success: true,
        freePlanActivated: true,
        subscription: await RestaurantSubscription.findById(subscription._id)
          .populate("plan")
          .lean(),
      });
    }

    if (!process.env.FRONTEND_URL || !/^https?:\/\//i.test(process.env.FRONTEND_URL)) {
      return res.status(500).json({ success: false, message: "FRONTEND_URL is not configured." });
    }

    let customerId = restaurant.billing?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: req.user.email,
          name: restaurant.name,
          metadata: { menupioRestaurantId: String(restaurant._id) },
        },
        { idempotencyKey: `menupio-restaurant-customer-${restaurant._id}` },
      );
      customerId = customer.id;
      await Restaurant.updateOne(
        { _id: restaurant._id },
        { $set: { "billing.stripeCustomerId": customerId } },
      );
    }

    const frontendUrl = process.env.FRONTEND_URL.replace(/\/+$/, "");
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded_page",
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: cycle.priceId, quantity: 1 }],
      return_url: `${frontendUrl}/dashboard/subscription?session_id={CHECKOUT_SESSION_ID}&restaurantId=${restaurant._id}`,
      redirect_on_completion: "if_required",
      metadata: {
        menupioRestaurantId: String(restaurant._id),
        menupioSubscriptionPlanId: String(plan._id),
      },
      subscription_data: {
        metadata: {
          menupioRestaurantId: String(restaurant._id),
          menupioSubscriptionPlanId: String(plan._id),
        },
        ...(plan.trialDays > 0 ? { trial_period_days: plan.trialDays } : {}),
      },
    });

    try {
      await RestaurantSubscription.create({
        restaurant: restaurant._id,
        plan: plan._id,
        stripeCustomerId: customerId,
        stripeCheckoutSessionId: session.id,
        stripePriceId: cycle.priceId,
        status: "incomplete",
        currency: plan.currency,
        amount: cycle.amount,
        interval: cycle.interval,
        intervalCount: cycle.intervalCount,
        planSnapshot: {
          name: plan.name,
          slug: plan.slug,
          description: plan.description,
          features: plan.features || {},
          limits: plan.limits || {},
        },
        metadata: { source: "embedded_checkout" },
      });
    } catch (error) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireError) {
        console.error("EXPIRE UNTRACKED SUBSCRIPTION CHECKOUT ERROR:", expireError);
      }
      throw error;
    }

    return res.status(201).json({
      success: true,
      clientSecret: session.client_secret,
      checkoutSessionId: session.id,
    });
  } catch (error) {
    console.error("CREATE SUBSCRIPTION CHECKOUT ERROR:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Could not start subscription checkout.",
    });
  } finally {
    if (checkoutLockRestaurantId) {
      try {
        await Restaurant.updateOne(
          { _id: checkoutLockRestaurantId },
          { $unset: { "billing.checkoutLockAt": 1 } },
        );
      } catch (error) {
        console.error("RELEASE SUBSCRIPTION CHECKOUT LOCK ERROR:", error);
      }
    }
  }
};

exports.upgradePlan = async (req, res) => {
  try {
    const { restaurantId, planId } = req.body || {};
    if (!mongoose.isValidObjectId(restaurantId) || !mongoose.isValidObjectId(planId)) {
      return res.status(400).json({
        success: false,
        message: "Restaurant ID or plan ID is invalid.",
      });
    }
    const restaurant = await getOwnedRestaurant(req.user._id, restaurantId);
    const subscription = await RestaurantSubscription.findOne({
      restaurant: restaurant._id,
      status: { $in: ["trialing", "active"] },
      stripeSubscriptionId: { $exists: true, $ne: null },
    })
      .sort({ createdAt: -1 })
      .populate("plan");
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "No active paid subscription was found to upgrade.",
      });
    }
    const plan = await SubscriptionPlan.findOne({
      _id: planId,
      active: true,
      archivedAt: null,
      stripeSyncStatus: "synced",
      stripePriceId: { $ne: null },
    });
    if (!plan || plan.price <= 0) {
      return res.status(404).json({ success: false, message: "This plan is unavailable." });
    }
    if (String(subscription.plan?._id) === String(plan._id)) {
      return res.status(409).json({ success: false, message: "This is already the current plan." });
    }
    const cycle = resolveBilling(
      plan,
      subscription.interval === "year" ? "yearly" : "monthly",
    );
    if (
      !cycle ||
      plan.currency !== subscription.currency ||
      cycle.interval !== subscription.interval ||
      cycle.intervalCount !== subscription.intervalCount
    ) {
      return res.status(409).json({
        success: false,
        message: "Upgrades are only available for plans with the same currency and billing interval.",
      });
    }
    if (cycle.amount <= subscription.amount) {
      return res.status(409).json({
        success: false,
        message: "The selected plan is not an upgrade.",
      });
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscription.stripeSubscriptionId,
    );
    const item = stripeSubscription.items?.data?.[0];
    if (!item) {
      return res.status(409).json({ success: false, message: "Stripe subscription has no items." });
    }
    const updated = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        items: [{ id: item.id, price: cycle.priceId }],
        proration_behavior: "always_invoice",
        payment_behavior: "error_if_incomplete",
        cancel_at_period_end: false,
        metadata: {
          ...(stripeSubscription.metadata || {}),
          menupioRestaurantId: String(restaurant._id),
          menupioSubscriptionPlanId: String(plan._id),
        },
      },
    );
    const synced = await syncRestaurantSubscription(updated);
    return res.json({ success: true, subscription: synced });
  } catch (error) {
    console.error("UPGRADE RESTAURANT SUBSCRIPTION ERROR:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Could not upgrade the subscription.",
    });
  }
};

exports.cancelCurrent = async (req, res) => {
  try {
    const { restaurantId } = req.body || {};
    if (!restaurantId) {
      return res.status(400).json({ success: false, message: "Restaurant is required." });
    }
    const restaurant = await getOwnedRestaurant(req.user._id, restaurantId);
    const subscription = await RestaurantSubscription.findOne({
      restaurant: restaurant._id,
      status: { $in: CURRENT_STATUSES },
    }).sort({ createdAt: -1 });
    if (!subscription) {
      return res.status(404).json({ success: false, message: "No current subscription was found." });
    }
    if (!subscription.stripeSubscriptionId) {
      if (subscription.stripeCheckoutSessionId) {
        await stripe.checkout.sessions.expire(subscription.stripeCheckoutSessionId);
      }
      subscription.status = "canceled";
      subscription.canceledAt = new Date();
      subscription.cancelAtPeriodEnd = false;
      await subscription.save();
      return res.json({ success: true, subscription });
    }
    const updated = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      { cancel_at_period_end: true },
    );
    const synced = await syncRestaurantSubscription(updated);
    return res.json({ success: true, subscription: synced });
  } catch (error) {
    console.error("CANCEL RESTAURANT SUBSCRIPTION ERROR:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Could not schedule subscription cancellation.",
    });
  }
};
