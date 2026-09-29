const mongoose = require("mongoose");
const Stripe = require("stripe");

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const getDatabaseStatus = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return {
        status: "unhealthy",
        state: mongoose.connection.readyState,
      };
    }

    // Lightweight MongoDB check
    await mongoose.connection.db.admin().ping();

    return {
      status: "healthy",
      state: mongoose.connection.readyState,
      name: mongoose.connection.name,
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
    };
  }
};

const getStripeStatus = async () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return {
      status: "not_configured",
    };
  }

  try {
    // Lightweight authenticated Stripe request
    await stripe.balance.retrieve();

    return {
      status: "healthy",
    };
  } catch (error) {
    return {
      status: "unhealthy",
      error: error.message,
    };
  }
};

exports.getHealth = async (req, res) => {
  const startedAt = Date.now();

  const [database, stripeStatus] = await Promise.all([
    getDatabaseStatus(),
    getStripeStatus(),
  ]);

  const api = {
    status: "healthy",
  };

  const services = {
    api,
    database,
    stripe: stripeStatus,
  };

  const databaseHealthy = database.status === "healthy";

  const stripeHealthy =
    stripeStatus.status === "healthy" ||
    stripeStatus.status === "not_configured";

  const overallHealthy = databaseHealthy && stripeHealthy;

  const response = {
    status: overallHealthy ? "healthy" : "unhealthy",

    api,

    database,

    stripe: stripeStatus,

    uptime: process.uptime(),

    responseTime: `${Date.now() - startedAt}ms`,

    version: process.env.APP_VERSION || "1.0.0",

    environment: process.env.NODE_ENV || "development",

    timestamp: new Date().toISOString(),
  };

  return res.status(overallHealthy ? 200 : 503).json(response);
};
