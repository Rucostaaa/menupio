// controllers/stripe.js

const Stripe = require("stripe");
const Restaurant = require("../models/Restaurant.js");
const User = require("../models/User");
const MenuItem = require("../models/MenuItem");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ============================================================
// HELPERS
// ============================================================

const getOwnerRestaurant = async (userId) => {
  const restaurant = await Restaurant.findOne({
    owner: userId,
  });

  if (!restaurant) {
    const error = new Error("Restaurante não encontrado.");
    error.statusCode = 404;
    throw error;
  }

  return restaurant;
};

const getStripeAccountId = (restaurant) => {
  const accountId = restaurant?.stripe?.accountId;

  if (!accountId) {
    const error = new Error(
      "Este negócio ainda não tem uma conta Stripe ligada.",
    );

    error.statusCode = 400;

    throw error;
  }

  return accountId;
};

// ============================================================
// GET STRIPE PRODUCTS
// ============================================================

exports.getStripeProducts = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user._id);

    const accountId = getStripeAccountId(restaurant);

    const products = await stripe.products.list(
      {
        limit: 100,
        active: true,
        expand: ["data.default_price"],
      },
      {
        stripeAccount: accountId,
      },
    );

    return res.status(200).json({
      success: true,
      products: products.data,
      hasMore: products.has_more,
    });
  } catch (error) {
    console.error("GET STRIPE PRODUCTS ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Não foi possível carregar os produtos Stripe.",
    });
  }
};

// ============================================================
// CREATE STRIPE PRODUCT
// ============================================================
exports.createStripeProduct = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user._id);

    const accountId = getStripeAccountId(restaurant);

    // ----------------------------------------------------------
    // GET MENU ITEM ID
    // ----------------------------------------------------------

    const { menuItemId } = req.body;

    if (!menuItemId) {
      return res.status(400).json({
        success: false,
        message: "O ID do produto é obrigatório.",
      });
    }

    // ----------------------------------------------------------
    // FIND MENU ITEM
    // ----------------------------------------------------------

    const menuItem = await MenuItem.findById(menuItemId);

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: "Produto não encontrado.",
      });
    }

    // ----------------------------------------------------------
    // SECURITY
    // ----------------------------------------------------------
    // Make sure this MenuItem actually belongs to the restaurant
    // whose Stripe account we are using.
    //
    // Adjust this condition depending on your MenuItem schema.
    // ----------------------------------------------------------

    if (
      menuItem.restaurant &&
      String(menuItem.restaurant) !== String(restaurant._id)
    ) {
      return res.status(403).json({
        success: false,
        message: "Este produto não pertence ao seu negócio.",
      });
    }

    // ----------------------------------------------------------
    // ALREADY CONNECTED?
    // ----------------------------------------------------------

    if (menuItem.stripe?.productId) {
      return res.status(409).json({
        success: false,
        message: "Este produto já está ligado ao Stripe.",
        stripeProductId: menuItem.stripe.productId,
        stripePriceId: menuItem.stripe.priceId || null,
      });
    }

    // ----------------------------------------------------------
    // GET PRODUCT DATA FROM MENUPIO
    // ----------------------------------------------------------

    const name =
      typeof menuItem.name === "string"
        ? menuItem.name.trim()
        : menuItem.name?.pt ||
          menuItem.name?.en ||
          Object.values(menuItem.name || {})[0] ||
          "";

    const description =
      typeof menuItem.description === "string"
        ? menuItem.description.trim()
        : menuItem.description?.pt || menuItem.description?.en || "";

    const numericPrice = Number(menuItem.price);

    const active = menuItem.available !== false;

    // ----------------------------------------------------------
    // VALIDATE PRODUCT DATA
    // ----------------------------------------------------------

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "O produto não tem um nome válido.",
      });
    }

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "O produto não tem um preço válido.",
      });
    }

    // ----------------------------------------------------------
    // CREATE STRIPE PRODUCT
    // ----------------------------------------------------------

    const stripeProduct = await stripe.products.create(
      {
        name,
        description: description || undefined,
        active,
        metadata: {
          menupioMenuItemId: String(menuItem._id),
          menupioRestaurantId: String(restaurant._id),
        },
      },
      {
        stripeAccount: accountId,
      },
    );

    // ----------------------------------------------------------
    // CREATE STRIPE PRICE
    // ----------------------------------------------------------

    const stripePrice = await stripe.prices.create(
      {
        product: stripeProduct.id,
        unit_amount: Math.round(numericPrice * 100),
        currency: "eur",
      },
      {
        stripeAccount: accountId,
      },
    );

    // ----------------------------------------------------------
    // SAVE STRIPE DATA ON MENUPIO PRODUCT
    // ----------------------------------------------------------

    menuItem.stripe = {
      ...(menuItem.stripe?.toObject
        ? menuItem.stripe.toObject()
        : menuItem.stripe || {}),

      connected: true,

      productId: stripeProduct.id,

      priceId: stripePrice.id,

      currency: "eur",

      active: Boolean(active),

      syncedAt: new Date(),
    };

    await menuItem.save();

    // ----------------------------------------------------------
    // RETRIEVE STRIPE PRODUCT WITH PRICE
    // ----------------------------------------------------------

    const productWithPrice = await stripe.products.retrieve(
      stripeProduct.id,
      {
        expand: ["default_price"],
      },
      {
        stripeAccount: accountId,
      },
    );

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(201).json({
      success: true,

      message: "Produto ligado ao Stripe com sucesso.",

      menuItem,

      product: productWithPrice,

      price: stripePrice,
    });
  } catch (error) {
    console.error("CREATE STRIPE PRODUCT ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Não foi possível criar o produto Stripe.",
    });
  }
};

// ============================================================
// UPDATE STRIPE PRODUCT
// ============================================================

exports.updateStripeProduct = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user._id);

    const accountId = getStripeAccountId(restaurant);

    const { productId } = req.params;

    const { name, description, active } = req.body;

    const update = {};

    // ----------------------------------------------------------
    // NAME
    // ----------------------------------------------------------

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({
          success: false,
          message: "O nome do produto não pode estar vazio.",
        });
      }

      update.name = String(name).trim();
    }

    // ----------------------------------------------------------
    // DESCRIPTION
    // ----------------------------------------------------------

    if (description !== undefined) {
      update.description = String(description || "").trim();
    }

    // ----------------------------------------------------------
    // ACTIVE
    // ----------------------------------------------------------

    if (active !== undefined) {
      update.active = Boolean(active);
    }

    // ----------------------------------------------------------
    // UPDATE
    // ----------------------------------------------------------

    const product = await stripe.products.update(productId, update, {
      stripeAccount: accountId,
    });

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("UPDATE STRIPE PRODUCT ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Não foi possível atualizar o produto Stripe.",
    });
  }
};

// ============================================================
// DELETE / ARCHIVE STRIPE PRODUCT
// ============================================================

exports.deleteStripeProduct = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user._id);

    const accountId = getStripeAccountId(restaurant);

    const { productId } = req.params;

    // Stripe products should normally be archived instead
    // of physically deleted.

    const product = await stripe.products.update(
      productId,
      {
        active: false,
      },
      {
        stripeAccount: accountId,
      },
    );

    return res.status(200).json({
      success: true,
      message: "Produto arquivado com sucesso.",
      product,
    });
  } catch (error) {
    console.error("DELETE STRIPE PRODUCT ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Não foi possível arquivar o produto Stripe.",
    });
  }
};

// ============================================================
// UPDATE STRIPE PRICE
// ============================================================

exports.updateStripePrice = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user._id);

    const accountId = getStripeAccountId(restaurant);

    const { priceId } = req.params;

    const { active } = req.body;

    // Stripe price amount/currency cannot be changed.
    // Only active/inactive can be updated.

    const update = {};

    if (active !== undefined) {
      update.active = Boolean(active);
    }

    const price = await stripe.prices.update(priceId, update, {
      stripeAccount: accountId,
    });

    return res.status(200).json({
      success: true,
      price,
    });
  } catch (error) {
    console.error("UPDATE STRIPE PRICE ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Não foi possível atualizar o preço Stripe.",
    });
  }
};

// ============================================================
// CREATE NEW PRICE FOR PRODUCT
// ============================================================

exports.createStripePrice = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user._id);

    const accountId = getStripeAccountId(restaurant);

    const { productId } = req.params;

    const { price, currency = "eur", active = true } = req.body;

    // ----------------------------------------------------------
    // VALIDATE PRICE
    // ----------------------------------------------------------

    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: "O preço deve ser superior a 0.",
      });
    }

    // ----------------------------------------------------------
    // CREATE PRICE
    // ----------------------------------------------------------

    const newPrice = await stripe.prices.create(
      {
        product: productId,
        unit_amount: Math.round(numericPrice * 100),
        currency: String(currency).toLowerCase(),
        active: Boolean(active),
      },
      {
        stripeAccount: accountId,
      },
    );

    return res.status(201).json({
      success: true,
      price: newPrice,
    });
  } catch (error) {
    console.error("CREATE STRIPE PRICE ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Não foi possível criar o preço Stripe.",
    });
  }
};

// ============================================================
// VENDOR MODE
// ============================================================

exports.updateVendorMode = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user._id);

    const { enabled } = req.body;

    restaurant.stripe = {
      ...(restaurant.stripe?.toObject
        ? restaurant.stripe.toObject()
        : restaurant.stripe || {}),

      vendorMode: Boolean(enabled),
    };
    console.log(restaurant);

    await restaurant.save();

    return res.status(200).json({
      success: true,
      vendorMode: restaurant.stripe.vendorMode,
    });
  } catch (error) {
    console.error("UPDATE VENDOR MODE ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Não foi possível atualizar o Vendor Mode.",
    });
  }
};

// ============================================================
// CONNECT STRIPE
// ============================================================

exports.connectStripe = async (req, res) => {
  try {
    const userId = req.user?._id;

    // ----------------------------------------------------------
    // AUTH
    // ----------------------------------------------------------

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // ----------------------------------------------------------
    // FIND USER
    // ----------------------------------------------------------

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilizador não encontrado.",
      });
    }

    // ----------------------------------------------------------
    // FIND RESTAURANT
    // ----------------------------------------------------------

    const restaurant = await Restaurant.findOne({
      owner: user._id,
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurante não encontrado.",
      });
    }

    // ----------------------------------------------------------
    // VALIDATE FRONTEND URL
    // ----------------------------------------------------------

    const frontendUrl = process.env.FRONTEND_URL;

    if (!frontendUrl) {
      return res.status(500).json({
        success: false,
        message: "FRONTEND_URL não está configurado no servidor.",
      });
    }

    if (!/^https?:\/\//i.test(frontendUrl)) {
      return res.status(500).json({
        success: false,
        message: "FRONTEND_URL deve começar por http:// ou https://.",
      });
    }

    // ----------------------------------------------------------
    // GET EXISTING ACCOUNT
    // ----------------------------------------------------------

    let accountId = restaurant.stripe?.accountId;

    // ----------------------------------------------------------
    // CREATE EXPRESS CONNECT ACCOUNT
    // ----------------------------------------------------------

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",

        country: "PT",

        email: user.email,

        business_profile: {
          name: restaurant.name,
        },

        capabilities: {
          card_payments: {
            requested: true,
          },

          transfers: {
            requested: true,
          },
        },
      });

      accountId = account.id;

      restaurant.stripe = {
        ...(restaurant.stripe?.toObject
          ? restaurant.stripe.toObject()
          : restaurant.stripe || {}),

        accountId,
      };

      await restaurant.save();
    }

    // ----------------------------------------------------------
    // CREATE ONBOARDING LINK
    // ----------------------------------------------------------

    const accountLink = await stripe.accountLinks.create({
      account: accountId,

      refresh_url: `${frontendUrl}/dashboard/settings?refresh=true`,

      return_url: `${frontendUrl}/dashboard/settings?success=true`,

      type: "account_onboarding",
    });

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,
      url: accountLink.url,
      accountId,
    });
  } catch (error) {
    console.error("STRIPE CONNECT ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error?.message || "Não foi possível iniciar a ligação ao Stripe.",
    });
  }
};

// ============================================================
// GET STRIPE STATUS
// ============================================================

exports.getStripeStatus = async (req, res) => {
  try {
    const userId = req.user?._id;

    // ----------------------------------------------------------
    // AUTH
    // ----------------------------------------------------------

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // ----------------------------------------------------------
    // FIND USER
    // ----------------------------------------------------------

    const user = await User.findById(userId).select("_id email role");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilizador não encontrado.",
      });
    }

    // ----------------------------------------------------------
    // FIND RESTAURANT
    // ----------------------------------------------------------

    const restaurant = await Restaurant.findOne({
      owner: user._id,
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurante não encontrado.",
      });
    }

    // ----------------------------------------------------------
    // CHECK STRIPE ACCOUNT
    // ----------------------------------------------------------

    const accountId = restaurant.stripe?.accountId;

    if (!accountId) {
      return res.status(200).json({
        success: true,

        connected: false,

        message: "Stripe ainda não está ligado.",

        stripe: {
          accountId: null,

          detailsSubmitted: false,

          chargesEnabled: false,

          payoutsEnabled: false,

          vendorMode: Boolean(restaurant.stripe?.vendorMode),
        },
      });
    }

    // ----------------------------------------------------------
    // RETRIEVE STRIPE ACCOUNT
    // ----------------------------------------------------------

    const account = await stripe.accounts.retrieve(accountId);

    // ----------------------------------------------------------
    // STATUS
    // ----------------------------------------------------------

    const detailsSubmitted = Boolean(account.details_submitted);

    const chargesEnabled = Boolean(account.charges_enabled);

    const payoutsEnabled = Boolean(account.payouts_enabled);

    // ----------------------------------------------------------
    // UPDATE DATABASE
    // ----------------------------------------------------------

    restaurant.stripe = {
      ...(restaurant.stripe?.toObject
        ? restaurant.stripe.toObject()
        : restaurant.stripe || {}),

      accountId: account.id,

      detailsSubmitted,

      chargesEnabled,

      payoutsEnabled,
    };

    await restaurant.save();

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,

      connected: true,

      stripe: {
        accountId: account.id,

        detailsSubmitted,

        chargesEnabled,

        payoutsEnabled,

        vendorMode: Boolean(restaurant.stripe?.vendorMode),

        country: account.country || null,

        defaultCurrency: account.default_currency || null,

        businessType: account.business_type || null,

        requirements: {
          currentlyDue: account.requirements?.currently_due || [],

          eventuallyDue: account.requirements?.eventually_due || [],

          pastDue: account.requirements?.past_due || [],

          pendingVerification: account.requirements?.pending_verification || [],

          disabledReason: account.requirements?.disabled_reason || null,

          errors: account.requirements?.errors || [],
        },
      },

      restaurant,
    });
  } catch (error) {
    console.error("GET STRIPE STATUS ERROR:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error?.message || "Não foi possível verificar o estado do Stripe.",
    });
  }
};
// ============================================================
// VENDOR MODE
// ============================================================

exports.updateVendorMode = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user._id);

    const { enabled } = req.body;

    restaurant.stripe = {
      ...(restaurant.stripe || {}),
      vendorMode: Boolean(enabled),
    };

    await restaurant.save();

    return res.status(200).json({
      success: true,
      vendorMode: restaurant.stripe.vendorMode,
    });
  } catch (error) {
    console.error("UPDATE VENDOR MODE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Não foi possível atualizar o Vendor Mode.",
    });
  }
};
exports.connectStripe = async (req, res) => {
  try {
    const userId = req.user._id;

    // ---------------------------------------------------------
    // FIND USER
    // ---------------------------------------------------------

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "Utilizador não encontrado.",
      });
    }

    // ---------------------------------------------------------
    // FIND RESTAURANT
    // ---------------------------------------------------------

    const restaurant = await Restaurant.findOne({
      owner: user._id,
    });

    if (!restaurant) {
      return res.status(404).json({
        message: "Restaurante não encontrado.",
      });
    }

    // ---------------------------------------------------------
    // VALIDATE FRONTEND URL
    // ---------------------------------------------------------

    const frontendUrl = process.env.FRONTEND_URL;

    if (!frontendUrl) {
      return res.status(500).json({
        message: "FRONTEND_URL não está configurado no servidor.",
      });
    }

    if (!/^https?:\/\//i.test(frontendUrl)) {
      return res.status(500).json({
        message: "FRONTEND_URL deve começar por http:// ou https://.",
      });
    }

    // ---------------------------------------------------------
    // GET EXISTING STRIPE ACCOUNT
    // ---------------------------------------------------------

    let accountId = restaurant.stripe?.accountId;

    // ---------------------------------------------------------
    // CREATE EXPRESS CONNECT ACCOUNT
    // ---------------------------------------------------------

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",

        email: user.email,

        business_profile: {
          name: restaurant.name,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        // Menupio restaurant is based in Portugal.
        country: "PT",
      });

      accountId = account.id;

      restaurant.stripe = {
        ...(restaurant.stripe || {}),
        accountId,
      };

      await restaurant.save();
    }

    // ---------------------------------------------------------
    // CREATE ACCOUNT ONBOARDING LINK
    // ---------------------------------------------------------

    const accountLink = await stripe.accountLinks.create({
      account: accountId,

      refresh_url: `${frontendUrl}` + `/dashboard/settings?refresh=true`,

      return_url: `${frontendUrl}` + `/dashboard/settings?success=true`,

      type: "account_onboarding",
    });

    // ---------------------------------------------------------
    // RESPONSE
    // ---------------------------------------------------------

    return res.status(200).json({
      url: accountLink.url,
      accountId,
    });
  } catch (error) {
    console.error("STRIPE CONNECT ERROR:", error);

    return res.status(500).json({
      message:
        error?.message || "Não foi possível iniciar a ligação ao Stripe.",
    });
  }
};
exports.getStripeStatus = async (req, res) => {
  try {
    // ----------------------------------------------------------
    // AUTH
    // ----------------------------------------------------------

    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // ----------------------------------------------------------
    // FIND USER
    // ----------------------------------------------------------

    const user = await User.findById(userId).select("_id email role");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilizador não encontrado.",
      });
    }

    // ----------------------------------------------------------
    // FIND RESTAURANT
    // ----------------------------------------------------------

    const restaurant = await Restaurant.findOne({
      owner: user._id,
    });

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurante não encontrado.",
      });
    }

    // ----------------------------------------------------------
    // CHECK STORED STRIPE ACCOUNT
    // ----------------------------------------------------------

    const accountId = restaurant.stripe?.accountId;

    if (!accountId) {
      return res.status(200).json({
        success: true,
        connected: false,
        message: "Stripe ainda não está ligado.",
        stripe: {
          accountId: null,
          detailsSubmitted: false,
          chargesEnabled: false,
          payoutsEnabled: false,
        },
      });
    }

    // ----------------------------------------------------------
    // RETRIEVE ACCOUNT FROM STRIPE
    // ----------------------------------------------------------

    const account = await stripe.accounts.retrieve(accountId);

    // ----------------------------------------------------------
    // GET CURRENT STATUS
    // ----------------------------------------------------------

    const detailsSubmitted = Boolean(account.details_submitted);

    const chargesEnabled = Boolean(account.charges_enabled);

    const payoutsEnabled = Boolean(account.payouts_enabled);

    // ----------------------------------------------------------
    // UPDATE DATABASE
    // ----------------------------------------------------------

    restaurant.stripe = {
      ...(restaurant.stripe?.toObject
        ? restaurant.stripe.toObject()
        : restaurant.stripe || {}),

      accountId: account.id,

      detailsSubmitted,
      chargesEnabled,
      payoutsEnabled,
    };

    await restaurant.save();

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.status(200).json({
      success: true,

      connected: true,

      stripe: {
        accountId: account.id,
        detailsSubmitted,
        chargesEnabled,
        payoutsEnabled,

        country: account.country || null,
        defaultCurrency: account.default_currency || null,

        businessType: account.business_type || null,

        requirements: {
          currentlyDue: account.requirements?.currently_due || [],

          eventuallyDue: account.requirements?.eventually_due || [],

          pastDue: account.requirements?.past_due || [],

          pendingVerification: account.requirements?.pending_verification || [],

          disabledReason: account.requirements?.disabled_reason || null,

          errors: account.requirements?.errors || [],
        },
      },

      restaurant,
    });
  } catch (error) {
    console.error("GET STRIPE STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message:
        error?.message || "Não foi possível verificar o estado do Stripe.",
    });
  }
};
