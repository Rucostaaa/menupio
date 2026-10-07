// controllers/stripe.js

const Stripe = require("stripe");
const Restaurant = require("../models/Restaurant.js");
const User = require("../models/User");
const Menu = require("../models/Menu");
const SiteItem = require("../models/SiteItem");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const toPlainObject = (value) => {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value && typeof value.toObject === "function") return value.toObject();
  return value && typeof value === "object" ? value : {};
};

const getLocalizedValues = (placementValue, siteItemValue) => {
  const placementValues = toPlainObject(placementValue);
  const hasPlacementValue = Object.values(placementValues).some(
    (value) => typeof value === "string" && value.trim(),
  );

  return hasPlacementValue ? placementValues : toPlainObject(siteItemValue);
};

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

exports.getStripeMenuItems = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user._id);
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 40);

    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A página e o limite devem ser números válidos (limite máximo: 100).",
      });
    }

    const menus = await Menu.find({ restaurant: restaurant._id })
      .select("items")
      .lean();
    const siteItemIds = [
      ...new Set(
        menus.flatMap((menu) =>
          (menu.items || [])
            .filter((entry) => entry?.itemModel === "SiteItem" && entry.item)
            .map((entry) => String(entry.item)),
        ),
      ),
    ];
    const total = siteItemIds.length;
    const pageIds = siteItemIds.slice((page - 1) * limit, page * limit);

    if (pageIds.length === 0) {
      return res.json({
        success: true,
        items: [],
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }

    const siteItems = await SiteItem.find({
      _id: { $in: pageIds },
      "placements.restaurant": restaurant._id,
    }).lean();
    const siteItemsById = new Map(
      siteItems.map((siteItem) => [String(siteItem._id), siteItem]),
    );
    const items = pageIds.flatMap((siteItemId) => {
      const siteItem = siteItemsById.get(siteItemId);
      const placement = siteItem?.placements?.find(
        (entry) => String(entry.restaurant) === String(restaurant._id),
      );

      if (!siteItem || !placement) return [];

      return [
        {
          _id: siteItem._id,
          name: getLocalizedValues(placement.name, siteItem.name),
          description: getLocalizedValues(
            placement.description,
            siteItem.description,
          ),
          price: placement.price,
          models: placement.models || [],
          image: placement.image?.length ? placement.image : siteItem.image,
          available: true,
          stripe: placement.stripe || {},
        },
      ];
    });

    return res.json({
      success: true,
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET STRIPE MENU ITEMS ERROR:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Não foi possível carregar os produtos do menu.",
    });
  }
};

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

    const { siteItemId } = req.body;

    if (!siteItemId) {
      return res.status(400).json({
        success: false,
        message: "O ID do produto é obrigatório.",
      });
    }

    const isInRestaurantMenu = await Menu.exists({
      restaurant: restaurant._id,
      items: {
        $elemMatch: {
          item: siteItemId,
          itemModel: "SiteItem",
        },
      },
    });
    if (!isInRestaurantMenu) {
      return res.status(404).json({
        success: false,
        message: "Este produto não está num menu deste negócio.",
      });
    }

    // ----------------------------------------------------------
    // FIND MENU ITEM
    // ----------------------------------------------------------

    const siteItem = await SiteItem.findOne({
      _id: siteItemId,
      "placements.restaurant": restaurant._id,
    });

    if (!siteItem) {
      return res.status(404).json({
        success: false,
        message: "Produto não encontrado.",
      });
    }

    const placement = siteItem.placements.find(
      (entry) => String(entry.restaurant) === String(restaurant._id),
    );
    if (!placement) {
      return res.status(404).json({
        success: false,
        message: "Este produto não está atribuído ao seu negócio.",
      });
    }

    // ----------------------------------------------------------
    // ALREADY CONNECTED?
    // ----------------------------------------------------------

    if (placement.stripe?.productId) {
      return res.status(409).json({
        success: false,
        message: "Este produto já está ligado ao Stripe.",
        stripeProductId: placement.stripe.productId,
        stripePriceId: placement.stripe.priceId || null,
      });
    }

    // ----------------------------------------------------------
    // GET PRODUCT DATA FROM MENUPIO
    // ----------------------------------------------------------

    const name =
      placement.name?.get?.("pt") ||
      placement.name?.get?.("en") ||
      placement.name?.pt ||
      placement.name?.en ||
      Object.values(placement.name?.toObject?.() || placement.name || {})[0] ||
      siteItem.name?.get?.("pt") ||
      siteItem.name?.get?.("en") ||
      siteItem.name?.pt ||
      siteItem.name?.en ||
      Object.values(siteItem.name?.toObject?.() || siteItem.name || {})[0] ||
      "";

    const description =
      placement.description?.get?.("pt") ||
      placement.description?.get?.("en") ||
      placement.description?.pt ||
      placement.description?.en ||
      siteItem.description?.get?.("pt") ||
      siteItem.description?.get?.("en") ||
      siteItem.description?.pt ||
      siteItem.description?.en ||
      "";

    const numericPrice = Number(placement.price);

    const active = true;

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
          menupioSiteItemId: String(siteItem._id),
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
    // SAVE STRIPE DATA ON THIS RESTAURANT'S SITE ITEM PLACEMENT
    // ----------------------------------------------------------

    placement.stripe = {
      connected: true,
      productId: stripeProduct.id,
      priceId: stripePrice.id,
      currency: "eur",
      active: Boolean(active),
      syncedAt: new Date(),
    };

    await siteItem.save();

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

      siteItem: {
        _id: siteItem._id,
        name,
        description,
        price: placement.price,
        models: placement.models,
        image: placement.image?.length ? placement.image : siteItem.image,
        available: true,
        stripe: placement.stripe,
      },

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

      restaurant.set("stripe.accountId", accountId);

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

    restaurant.set({
      "stripe.accountId": account.id,
      "stripe.detailsSubmitted": detailsSubmitted,
      "stripe.chargesEnabled": chargesEnabled,
      "stripe.payoutsEnabled": payoutsEnabled,
    });

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

exports.getStripeFinance = async (req, res) => {
  try {
    const restaurant = await getOwnerRestaurant(req.user?._id);
    const accountId = getStripeAccountId(restaurant);
    const transactionSummaryPromise = (async () => {
      const summary = {
        recent: [],
        gross: 0,
        net: 0,
        transactionCount: 0,
      };
      const transactionList = stripe.balanceTransactions.list(
        {
          limit: 100,
          created: {
            gte: Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60,
          },
        },
        { stripeAccount: accountId },
      );

      await transactionList.autoPagingEach((transaction) => {
        const isSale = ["charge", "payment"].includes(transaction.type);
        if (isSale) {
          summary.gross += transaction.amount;
          summary.net += transaction.net;
          summary.transactionCount += 1;
        } else if (transaction.type === "refund") {
          summary.net += transaction.net;
        }

        if (summary.recent.length < 100) {
          summary.recent.push({
            id: transaction.id,
            amount: transaction.amount,
            fee: transaction.fee,
            net: transaction.net,
            currency: transaction.currency,
            type: transaction.type,
            description: transaction.description,
            status: transaction.status,
            created: transaction.created,
            reportingCategory: transaction.reporting_category,
          });
        }
      });

      return summary;
    })();
    const [account, balance, transactionSummary, payouts] = await Promise.all([
      stripe.accounts.retrieve(accountId),
      stripe.balance.retrieve({}, { stripeAccount: accountId }),
      transactionSummaryPromise,
      stripe.payouts.list({ limit: 20 }, { stripeAccount: accountId }),
    ]);

    const schedule = {
      interval:
        account.settings?.payouts?.schedule?.interval || "manual",
      weeklyAnchor:
        account.settings?.payouts?.schedule?.weekly_anchor || null,
    };

    if (
      restaurant.stripe?.payoutSchedule?.interval !== schedule.interval ||
      restaurant.stripe?.payoutSchedule?.weeklyAnchor !== schedule.weeklyAnchor
    ) {
      restaurant.stripe.payoutSchedule = schedule;
      await restaurant.save();
    }

    return res.status(200).json({
      success: true,
      balance: {
        available: balance.available || [],
        pending: balance.pending || [],
      },
      revenue30Days: {
        gross: transactionSummary.gross,
        net: transactionSummary.net,
        currency: account.default_currency || "eur",
        transactionCount: transactionSummary.transactionCount,
      },
      transactions: transactionSummary.recent,
      payouts: (payouts.data || []).map((payout) => ({
        id: payout.id,
        amount: payout.amount,
        currency: payout.currency,
        status: payout.status,
        arrivalDate: payout.arrival_date,
        created: payout.created,
        description: payout.description,
        failureCode: payout.failure_code,
        failureMessage: payout.failure_message,
      })),
      schedule,
    });
  } catch (error) {
    console.error("GET STRIPE FINANCE ERROR:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error?.message || "Não foi possível carregar os dados financeiros.",
    });
  }
};

exports.updateStripePayoutSchedule = async (req, res) => {
  try {
    const { interval, weeklyAnchor } = req.body || {};
    if (
      !["daily", "weekly"].includes(interval) ||
      (interval === "weekly" &&
        ![
          "monday",
          "tuesday",
          "wednesday",
          "thursday",
          "friday",
          "saturday",
          "sunday",
        ].includes(weeklyAnchor))
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Choose daily payouts or a valid weekly payout day.",
      });
    }

    const restaurant = await getOwnerRestaurant(req.user?._id);
    const accountId = getStripeAccountId(restaurant);
    if (restaurant.stripe?.payoutsEnabled !== true) {
      return res.status(409).json({
        success: false,
        message: "Stripe payouts are not enabled for this connected account.",
      });
    }

    const schedule = {
      interval,
      ...(interval === "weekly" ? { weekly_anchor: weeklyAnchor } : {}),
    };
    const account = await stripe.accounts.update(accountId, {
      settings: {
        payouts: { schedule },
      },
    });

    restaurant.stripe.payoutSchedule = {
      interval: account.settings?.payouts?.schedule?.interval || interval,
      weeklyAnchor:
        account.settings?.payouts?.schedule?.weekly_anchor ||
        (interval === "weekly" ? weeklyAnchor : null),
    };
    await restaurant.save();

    return res.status(200).json({
      success: true,
      schedule: restaurant.stripe.payoutSchedule,
    });
  } catch (error) {
    console.error("UPDATE STRIPE PAYOUT SCHEDULE ERROR:", error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error?.message || "Não foi possível alterar a frequência dos pagamentos.",
    });
  }
};
// ============================================================
// VENDOR MODE
// ============================================================

exports.updateVendorMode = async (req, res) => {
  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "Vendor Mode must be enabled or disabled with a boolean value.",
      });
    }

    const restaurant = await getOwnerRestaurant(req.user?._id);
    await Restaurant.updateOne(
      { _id: restaurant._id, owner: req.user._id },
      { $set: { "stripe.vendorMode": enabled } },
      { runValidators: true },
    );

    return res.status(200).json({
      success: true,
      vendorMode: enabled,
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

    if (accountId) {
      const existingAccount = await stripe.accounts.retrieve(accountId);
      if (existingAccount.details_submitted) {
        return res.status(409).json({
          success: false,
          detailsSubmitted: true,
          chargesEnabled: Boolean(existingAccount.charges_enabled),
          message: existingAccount.charges_enabled
            ? "Stripe onboarding is complete. Activate menu payments in Stripe Settings."
            : "Your documents have been submitted. Wait for Stripe to finish reviewing your account.",
        });
      }
    }

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

      restaurant.set("stripe.accountId", accountId);

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

    restaurant.set({
      "stripe.accountId": account.id,
      "stripe.detailsSubmitted": detailsSubmitted,
      "stripe.chargesEnabled": chargesEnabled,
      "stripe.payoutsEnabled": payoutsEnabled,
    });

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
