const mongoose = require("mongoose");

const templateSchema = new mongoose.Schema(
  {
    // Information

    name: {
      pt: { type: String, required: true },
      en: { type: String, required: true },
    },

    description: {
      pt: String,
      en: String,
    },

    slug: {
      type: String,
      unique: true,
      required: true,
    },

    thumbnail: String,

    previewImages: [String],

    style: {
      type: String,
      enum: ["store", "card-list", "list"],
      default: "card-list",
    },

    version: {
      type: Number,
      default: 1,
    },

    premium: {
      type: Boolean,
      default: false,
    },

    available: {
      type: Boolean,
      default: true,
    },

    // COLORS

    colors: {
      primary: {
        type: String,
        default: "#4A2D1A",
      },

      secondary: {
        type: String,
        default: "#D8A24D",
      },

      accent: {
        type: String,
        default: "#F8F2E9",
      },

      background: {
        type: String,
        default: "#FCF8F3",
      },

      text: {
        type: String,
        default: "#2B180D",
      },
    },

    // TYPOGRAPHY

    typography: {
      heading: {
        type: String,
        default: "Playfair Display",
      },

      body: {
        type: String,
        default: "Inter",
      },
    },

    // NAVBAR

    navbar: {
      show: {
        type: Boolean,
        default: true,
      },

      hasLogo: {
        type: Boolean,
        default: true,
      },

      hasLinks: {
        type: Boolean,
        default: false,
      },

      hasTranslator: {
        type: Boolean,
        default: true,
      },

      hasSearch: {
        type: Boolean,
        default: false,
      },

      sticky: {
        type: Boolean,
        default: true,
      },

      transparent: {
        type: Boolean,
        default: false,
      },
    },

    // HERO

    hero: {
      show: {
        type: Boolean,
        default: true,
      },

      hasImage: {
        type: Boolean,
        default: true,
      },

      hasDescription: {
        type: Boolean,
        default: true,
      },

      hasCTA: {
        type: Boolean,
        default: false,
      },
    },

    // SIDEBAR

    sidebar: {
      show: {
        type: Boolean,
        default: true,
      },

      position: {
        type: String,
        enum: ["left", "top", "none"],
        default: "left",
      },

      collapsible: {
        type: Boolean,
        default: false,
      },
    },

    // PRODUCT CARD

    productCard: {
      image: true,

      description: true,

      price: true,

      allergens: false,

      ingredients: false,

      availability: true,

      rounded: true,

      shadow: true,
    },

    // FOOTER

    footer: {
      show: true,

      showOpeningHours: true,

      showContacts: true,

      showAddress: true,

      showSocials: true,

      showFooterMessage: true,
    },

    // ANIMATIONS

    animations: {
      hoverCards: {
        type: Boolean,
        default: true,
      },

      fadeIn: {
        type: Boolean,
        default: true,
      },

      scrollAnimation: {
        type: Boolean,
        default: false,
      },
    },

    // FEATURES

    features: {
      qrCode: true,

      languageSelector: true,

      categoryScroll: true,

      productSearch: false,

      whatsappButton: false,

      orderOnline: false,

      reservations: false,

      reviews: false,
    },

    // LAYOUT

    layout: {
      productsPerRowDesktop: {
        type: Number,
        default: 4,
      },

      productsPerRowTablet: {
        type: Number,
        default: 3,
      },

      productsPerRowMobile: {
        type: Number,
        default: 2,
      },
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Template", templateSchema);
