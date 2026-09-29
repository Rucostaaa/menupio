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
    menuItem: restaurant.fidelization.menuItem,
    maxStamps: card?.maxStamps || restaurant.fidelization.maxStamps,
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
      role: "user",
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

exports.stampLoyaltyCard = async (req, res) => {
  try {
    const { userId, stamps = 1 } = req.body || {};
    const amount = Number(stamps);

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user ID." });
    }

    if (!Number.isInteger(amount) || amount < 1 || amount > 10) {
      return res.status(400).json({
        success: false,
        message: "Stamps must be an integer between 1 and 10.",
      });
    }

    const restaurant = await Restaurant.findOne({
      _id: req.params.restaurantId,
      owner: req.user._id,
    }).populate("fidelization.menuItem", "name price image");

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found or not owned by you.",
      });
    }

    if (!restaurant.hasFidelization || !restaurant.fidelization?.menuItem) {
      return res.status(400).json({
        success: false,
        message: "Loyalty cards are not enabled for this restaurant.",
      });
    }

    const user = await User.findById(userId);

    if (!user || user.role !== "user") {
      return res
        .status(404)
        .json({ success: false, message: "Customer not found." });
    }

    let card = user.loyaltyCards.find(
      (item) => String(item.restaurant) === String(restaurant._id),
    );

    if (!card) {
      card = user.loyaltyCards.create({
        restaurant: restaurant._id,
        menuItem: restaurant.fidelization.menuItem._id,
        maxStamps: restaurant.fidelization.maxStamps,
        stamps: 0,
        history: [],
      });
      user.loyaltyCards.push(card);
      card = user.loyaltyCards[user.loyaltyCards.length - 1];
    }

    card.stamps = Math.min(card.stamps + amount, card.maxStamps);
    card.history.push({ stamps: amount, action: "added" });
    await user.save();

    const payload = getCardPayload(user, restaurant);
    getSocket()?.to(`user:${userId}`).emit("loyalty:updated", payload);

    return res.status(200).json({
      success: true,
      message: "Loyalty card updated.",
      card: payload,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to stamp loyalty card.",
    });
  }
};
