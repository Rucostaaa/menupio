const mongoose = require("mongoose");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const Image = require("../models/Image");
const {
  hasLoyaltyTargets,
  findEligibleSiteItems,
  getConfiguredItemIds,
  getConfiguredCategoryIds,
} = require("../utils/loyaltyConfig");
const { getSocket } = require("../utils/socket");

const getRestaurant = async (restaurantId) => {
  if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
    const error = new Error("Invalid restaurant ID.");
    error.statusCode = 400;
    throw error;
  }

  const restaurant = await Restaurant.findById(restaurantId).populate(
    "fidelization.menuItem",
    "name price image",
  );

  if (!restaurant) {
    const error = new Error("Restaurant not found.");
    error.statusCode = 404;
    throw error;
  }

  if (!restaurant.hasFidelization) {
    const error = new Error(
      "Loyalty cards are not enabled for this restaurant.",
    );
    error.statusCode = 400;
    throw error;
  }

  return restaurant;
};

// Item shown on the card: the first product that earns stamps.
const resolveDisplayItem = async (restaurant) => {
  const [item] = await findEligibleSiteItems(restaurant, "_id name images");

  if (!item) return null;

  return { _id: item._id, name: item.name, images: item.images };
};

const getCardPayload = (user, restaurant, displayItem = null) => {
  const card = user.loyaltyCards.find(
    (item) => String(item.restaurant) === String(restaurant._id),
  );
  const config = restaurant.fidelization?.[0];

  return {
    cardId: card?._id ? String(card._id) : null,
    userId: String(user._id),
    restaurantId: String(restaurant._id),
    restaurantName: restaurant.name,
    stamps: card?.stamps || 0,
    freeCoffes: card?.freeCoffes || 0,
    maxStamps: card?.maxStamps || config?.maxStamps || 10,
    menuItem: displayItem,
    siteItems: getConfiguredItemIds(config),
    siteCategories: getConfiguredCategoryIds(config),
    history: card?.history || [],
  };
};

const emitLoyaltyPayload = (userId, payload) => {
  const io = getSocket();

  if (!io) {
    console.warn("[LOYALTY] Socket.IO instance is not available.");
    return;
  }

  io.to(`user:${userId}`).emit("loyalty:updated", payload);
};
exports.getMyLoyaltyCard = async (req, res) => {
  try {
    const restaurant = await getRestaurant(req.params.restaurantId);
    const user = await User.findById(req.user._id);

    return res.status(200).json({
      success: true,
      card: getCardPayload(
        user,
        restaurant,
        await resolveDisplayItem(restaurant),
      ),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to load loyalty card.",
    });
  }
};

exports.getLoyaltyStampImage = async (req, res) => {
  try {
    const restaurant = await getRestaurant(req.params.restaurantId);
    const eligible = await findEligibleSiteItems(
      restaurant,
      "_id images image",
    );
    console.log("eligible items for stamp image:", eligible);
    let stampImage = null;

    for (const item of eligible) {
      for (const imageId of item.images || []) {
        stampImage =
          byId.get(String(imageId))?.flyer?.find((flyer) => flyer?.image)
            ?.image || null;
        if (stampImage) break;
      }
      if (stampImage) break;
    }

    return res.status(200).json({
      success: true,
      stampImage: eligible.length > 0 ? eligible[0]?.image[0] : null,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to load stamp image.",
    });
  }
};

exports.getRestaurantLoyaltyUsers = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({
      _id: req.params.restaurantId,
      owner: req.user._id,
      hasFidelization: true,
    }).select("_id");

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found or loyalty is disabled.",
      });
    }

    const users = await User.find({
      "loyaltyCards.restaurant": restaurant._id,
    }).select("_id name email loyaltyCards");

    return res.status(200).json({
      success: true,
      users: users.map((user) => {
        const card = user.loyaltyCards.find(
          (item) => String(item.restaurant) === String(restaurant._id),
        );

        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          stamps: card?.stamps || 0,
          maxStamps: card?.maxStamps || 10,
        };
      }),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to load loyalty users.",
    });
  }
};
exports.getLoyaltyCards = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        message: "Utilizador não autenticado.",
      });
    }

    const user = await User.findById(userId)
      .populate({
        path: "loyaltyCards.restaurant",
        select: "name logo hasFidelization fidelization",
      })
      .populate({
        path: "loyaltyCards.menuItem",
        select: "name images",
      });

    if (!user) {
      return res.status(404).json({
        message: "Utilizador não encontrado.",
      });
    }

    return res.status(200).json({
      cards: user.loyaltyCards || [],
    });
  } catch (error) {
    console.error("GET USER LOYALTY CARDS ERROR:", error);

    return res.status(500).json({
      message: "Não foi possível carregar os cartões de lealdade.",
    });
  }
};
exports.stampLoyaltyCard = async (req, res) => {
  try {
    const { userId, stamps = 1 } = req.body || {};
    const amount = Number(stamps);

    console.log(
      `[LOYALTY] Stamp request received | restaurant=${req.params.restaurantId} | user=${userId} | stamps=${amount}`,
    );

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log(`[LOYALTY] Invalid user ID: ${userId}`);

      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    if (!Number.isInteger(amount) || amount < 1 || amount > 10) {
      console.log(`[LOYALTY] Invalid stamp amount: ${amount}`);

      return res.status(400).json({
        success: false,
        message: "Stamps must be an integer between 1 and 10.",
      });
    }

    const restaurant = await Restaurant.findOne({
      _id: req.params.restaurantId,
      owner: req.user._id,
    });

    if (!restaurant) {
      console.log(
        `[LOYALTY] Restaurant not found or not owned | restaurant=${req.params.restaurantId}`,
      );

      return res.status(404).json({
        success: false,
        message: "Restaurant not found or not owned by you.",
      });
    }

    if (
      !restaurant.hasFidelization ||
      !hasLoyaltyTargets(restaurant.fidelization[0])
    ) {
      console.log(
        `[LOYALTY] Loyalty not enabled | restaurant=${restaurant._id}`,
      );

      return res.status(400).json({
        success: false,
        message: "Loyalty cards are not enabled for this restaurant.",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      console.log(`[LOYALTY] User not found | user=${userId}`);

      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const displayItem = await resolveDisplayItem(restaurant);

    let card = user.loyaltyCards.find(
      (item) => String(item.restaurant) === String(restaurant._id),
    );

    const cardWasCreated = !card;

    if (!card) {
      card = user.loyaltyCards.create({
        restaurant: restaurant._id,
        menuItem: displayItem?._id || null,
        maxStamps: restaurant.fidelization[0].maxStamps,
        stamps: 0,
        freeCoffes: 0,
        history: [],
      });

      user.loyaltyCards.push(card);

      card = user.loyaltyCards[user.loyaltyCards.length - 1];
    } else if (!card.menuItem && displayItem) {
      card.menuItem = displayItem._id;
    }

    const previousStamps = Number(card.stamps) || 0;
    const previousFreeCoffes = Number(card.freeCoffes) || 0;
    const maxStamps = Number(card.maxStamps) || 10;

    console.log(
      `[LOYALTY] Before update | stamps=${previousStamps} | freeCoffes=${previousFreeCoffes} | maxStamps=${maxStamps}`,
    );

    /*
     * =========================================================
     * 1. USER ALREADY HAS A FREE COFFEE
     * =========================================================
     *
     * The next stamp is used to redeem the free coffee.
     *
     * Example:
     *
     * freeCoffes = 1
     * stamps = 9
     *
     * Scan:
     *
     * freeCoffes -> 0
     * stamps -> 0
     */

    if (previousFreeCoffes > 0) {
      card.freeCoffes = previousFreeCoffes - 1;
      card.stamps = 0;

      card.history.push({
        stamps: 0,
        action: "redeemed",
      });

      await user.save();

      console.log(
        `[LOYALTY] FREE COFFEE REDEEMED | user=${userId} | card=${card._id} | previousFreeCoffes=${previousFreeCoffes} | remainingFreeCoffes=${card.freeCoffes} | stamps reset=0`,
      );

      const payload = getCardPayload(user, restaurant, displayItem);

      console.log(
        `[LOYALTY] Socket emit | room=user:${userId} | event=loyalty:updated`,
      );

      console.log(
        "[LOYALTY] Socket payload:",
        JSON.stringify(payload, null, 2),
      );

      emitLoyaltyPayload(userId, payload);

      return res.status(200).json({
        success: true,
        message: "Café grátis utilizado.",
        card: payload,
      });
    }

    /*
     * =========================================================
     * 2. NORMAL STAMPING
     * =========================================================
     */

    const newStampTotal = previousStamps + amount;

    /*
     * =========================================================
     * 3. REWARD THRESHOLD
     * =========================================================
     *
     * Example:
     *
     * 8 + 1 = 9
     *
     * The user earns ONE free coffee.
     *
     * We keep the 9 stamps on the card because the UI uses
     * those 9 collected stamps to show the reward as unlocked.
     */

    if (newStampTotal >= maxStamps - 1) {
      card.stamps = Math.min(newStampTotal, maxStamps - 1);
      card.freeCoffes = previousFreeCoffes + 1;

      card.history.push({
        stamps: amount,
        action: "added",
      });

      console.log(
        `[LOYALTY] 🎁 FREE COFFEE EARNED | user=${userId} | previousStamps=${previousStamps} | added=${amount} | newStamps=${card.stamps} | freeCoffes=${card.freeCoffes}`,
      );
    } else {
      /*
       * Normal stamp.
       */

      card.stamps = newStampTotal;

      card.history.push({
        stamps: amount,
        action: "added",
      });

      console.log(
        `[LOYALTY] Stamp added | user=${userId} | previous=${previousStamps} | added=${amount} | new=${card.stamps} | max=${maxStamps}`,
      );
    }

    await user.save();

    console.log(
      `[LOYALTY] Card saved | user=${userId} | card=${card._id} | previous=${previousStamps} | added=${amount} | new=${card.stamps} | freeCoffes=${card.freeCoffes} | max=${card.maxStamps} | created=${cardWasCreated}`,
    );

    const payload = getCardPayload(user, restaurant, displayItem);

    console.log(
      `[LOYALTY] Socket emit | room=user:${userId} | event=loyalty:updated`,
    );

    console.log("[LOYALTY] Socket payload:", JSON.stringify(payload, null, 2));

    emitLoyaltyPayload(userId, payload);

    return res.status(200).json({
      success: true,
      message:
        card.freeCoffes > previousFreeCoffes
          ? "Café grátis desbloqueado."
          : "Cartão de fidelização atualizado.",
      card: payload,
    });
  } catch (error) {
    console.error("[LOYALTY] stampLoyaltyCard error:", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to stamp loyalty card.",
    });
  }
};
