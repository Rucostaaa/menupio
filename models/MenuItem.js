const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
    },

    name: { pt: String, en: String },

    description: { pt: String, en: String },

    price: Number,

    image: [String],

    ingredients: [String],
    models: [
      {
        title: {
          pt: String,
          en: String,
        },
        price: Number,
      },
    ],
    allergens: [
      {
        pt: String,
        en: String,
      },
    ],
    promo: {
      status: Boolean,
      text: String,
      price: Number,
    },

    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    available: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("MenuItem", menuItemSchema);
