const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    activity: [{ pt: String, en: String }],
    name: String,

    description: String,
    email: String,
    address: String,
    location: String,
    phone: String,
    logo: String,
    menus: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Menu",
      },
    ],
    coverImage: String,
    footerMessage: String,
    mainImage: String,

    openingHours: Object,
    facebook: String,
    instagram: String,
    whatsAppNumber: String,
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Restaurant", restaurantSchema);
