const mongoose = require("mongoose");

const menuSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
    },
    ownId: {
      type: Number,
      required: true,
    },
    mainImage: {
      type: String,
      default: null,
    },

    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItem",
      },
    ],

    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],

    available: {
      type: Boolean,
      default: true,
    },
    type: String,
    style: String,
    settings: {
      type: Object,
    },
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Menu", menuSchema);
