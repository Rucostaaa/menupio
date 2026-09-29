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
    whatsAppButton: { type: Boolean, default: false },
    mainImage: {
      type: String,
      default: null,
    },
    headerImage: {
      type: String,
      default: null,
    },
    hasAdverts: {
      type: Boolean,
      default: false,
    },
    isAdvert: {
      type: Boolean,
      default: false,
    },
    hasCustom: {
      type: Boolean,
      default: false,
    },

    categorySystem: String,
    items: [
      {
        item: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          refPath: "items.itemModel",
        },
        itemModel: {
          type: String,
          required: true,
          enum: ["MenuItem", "SiteItem"],
        },
      },
    ],
    mainCategory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MainCategory",
      },
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SiteMainCategory",
      },
    ],
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SiteCategory",
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
