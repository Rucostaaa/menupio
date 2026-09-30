const mongoose = require("mongoose");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");
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

const getCardPayload = (user, restaurant) => {
  const card = user.loyaltyCards.find(
    (item) => String(item.restaurant) === String(restaurant._id),
  );

  return {
    userId: String(user._id),
    restaurantId: String(restaurant._id),
    restaurantName: restaurant.name,
    stamps: card?.stamps || 0,
    history: card?.history || [],
  };
};

exports.getMyLoyaltyCard = async (req, res) => {
  try {
    const restaurant = await getRestaurant(req.params.restaurantId);
    const user = await User.findById(req.user._id);

    return res.status(200).json({
      success: true,
      card: getCardPayload(user, restaurant),
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to load loyalty card.",
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
    }).populate("fidelization.menuItem", "name price images");

    if (!restaurant) {
      console.log(
        `[LOYALTY] Restaurant not found or not owned | restaurant=${req.params.restaurantId}`,
      );

      return res.status(404).json({
        success: false,
        message: "Restaurant not found or not owned by you.",
      });
    }

    if (!restaurant.hasFidelization || !restaurant.fidelization[0]?.menuItem) {
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

    let card = user.loyaltyCards.find(
      (item) => String(item.restaurant) === String(restaurant._id),
    );

    const cardWasCreated = !card;

    if (!card) {
      card = user.loyaltyCards.create({
        restaurant: restaurant._id,
        menuItem: restaurant.fidelization[0].menuItem._id,
        maxStamps: restaurant.fidelization[0].maxStamps,
        stamps: 0,
        history: [],
      });

      user.loyaltyCards.push(card);

      card = user.loyaltyCards[user.loyaltyCards.length - 1];
    }

    const previousStamps = Number(card.stamps) || 0;

    card.stamps = Math.min(previousStamps + amount, card.maxStamps);

    card.history.push({
      stamps: amount,
      action: "added",
    });

    await user.save();

    console.log(
      `[LOYALTY] Card saved | user=${userId} | card=${card._id} | previous=${previousStamps} | added=${amount} | new=${card.stamps} | max=${card.maxStamps} | created=${cardWasCreated}`,
    );

    const payload = getCardPayload(user, restaurant);

    console.log(
      `[LOYALTY] Socket emit | room=user:${userId} | event=loyalty:updated`,
    );

    console.log("[LOYALTY] Socket payload:", JSON.stringify(payload, null, 2));

    const socket = getSocket();

    if (!socket) {
      console.warn("[LOYALTY] Socket.IO instance is not available.");
    } else {
      socket.to(`user:${userId}`).emit("loyalty:updated", payload);

      console.log(
        `[LOYALTY] Socket event emitted successfully | room=user:${userId}`,
      );
    }

    return res.status(200).json({
      success: true,
      message: "Loyalty card updated.",
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
