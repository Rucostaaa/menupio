const mongoose = require("mongoose");
const languages = [
  { title: "pt", language: "Português" },
  { title: "en", language: "English" },
  { title: "es", language: "Español" },
  { title: "fr", language: "Français" },
  { title: "de", language: "Deutsch" },
  { title: "it", language: "Italiano" },
  { title: "nl", language: "Nederlands" },
];

const restaurantSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    activity: [{ pt: String, en: String }],
    mlActivity: [
      {
        type: [String],
        enum: languages.map((item) => item.title),
        default: ["pt", "en"],
      },
    ],
    name: String,
    description: String,
    mlDescription: [
      {
        type: [String],
        enum: languages.map((item) => item.title),
        default: ["pt", "en"],
      },
    ],
    email: String,
    address: String,
    location: String,
    phone: String,
    logo: String,
    employers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    menus: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Menu",
      },
    ],
    stripe: {
      paymentsEnabled: {
        type: Boolean,
        default: false,
      },
      accountId: {
        type: String,
        default: null,
      },

      detailsSubmitted: {
        type: Boolean,
        default: false,
      },

      chargesEnabled: {
        type: Boolean,
        default: false,
      },

      payoutsEnabled: {
        type: Boolean,
        default: false,
      },

      vendorMode: {
        type: Boolean,
        default: false,
      },
    },
    coverImage: String,
    language: {
      type: [String],
      enum: languages.map((item) => item.title),
      default: ["pt", "en"],
    },
    footerMessage: String,
    mainImage: String,
    since: Number,
    openingHours: Object,
    facebook: String,
    instagram: String,
    whatsAppNumber: String,
    website: String,
    hasFidelization: {
      type: Boolean,
      default: false,
    },
    fidelization: {
      menuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SiteItem",
        default: null,
      },
      maxStamps: {
        type: Number,
        default: 10,
        min: 1,
        max: 100,
      },
    },
  },
  {
    timestamps: true,
  },
);

module.exports =
  mongoose.models.Restaurant || mongoose.model("Restaurant", restaurantSchema);
