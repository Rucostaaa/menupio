const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    // =========================================================
    // USER / VISITOR
    // =========================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    visitorId: {
      type: String,
      required: true,
      index: true,
    },

    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // =========================================================
    // REAL TIME
    // =========================================================

    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    lastSeen: {
      type: Date,
      default: Date.now,
      index: true,
    },

    endedAt: {
      type: Date,
      default: null,
    },

    sessionTime: {
      type: Number,
      default: 0,
    },

    currentPage: {
      type: String,
      default: null,
    },

    currentPath: {
      type: String,
      default: null,
    },

    // =========================================================
    // DEVICE / BROWSER
    // =========================================================

    device: {
      type: String,
      default: null,
    },

    browser: {
      type: String,
      default: null,
    },

    browserVersion: {
      type: String,
      default: null,
    },

    os: {
      type: String,
      default: null,
    },

    osVersion: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },

    screen: {
      width: Number,
      height: Number,
      pixelRatio: Number,
    },

    viewport: {
      width: Number,
      height: Number,
    },

    // =========================================================
    // LOCATION / LANGUAGE
    // =========================================================

    language: {
      type: String,
      default: null,
    },

    languages: {
      type: [String],
      default: [],
    },

    timezone: {
      type: String,
      default: null,
    },

    country: {
      type: String,
      default: null,
    },

    region: {
      type: String,
      default: null,
    },

    city: {
      type: String,
      default: null,
    },

    // =========================================================
    // TRAFFIC
    // =========================================================

    referrer: {
      type: String,
      default: null,
    },

    landingPage: {
      type: String,
      default: null,
    },

    utm: {
      source: {
        type: String,
        default: null,
      },

      medium: {
        type: String,
        default: null,
      },

      campaign: {
        type: String,
        default: null,
      },

      term: {
        type: String,
        default: null,
      },

      content: {
        type: String,
        default: null,
      },
    },

    // =========================================================
    // IP
    // =========================================================

    ipHash: {
      type: String,
      default: null,
    },

    // =========================================================
    // MENU ACTIVITY
    // =========================================================

    seen: {
      menuSeen: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Menu",
        default: null,
      },

      advertsSeen: {
        type: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Advert",
          },
        ],
        default: [],
      },

      menuItemsBought: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Cart",
        default: null,
      },

      advertItemsBought: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Cart",
        default: null,
      },
    },

    // =========================================================
    // PRODUCT CLICKS
    // =========================================================

    productClicks: [
      {
        /*
         * The actual product clicked.
         *
         * You appear to have MenuItems in the frontend,
         * so this is the primary reference.
         */
        menuItem: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MenuItems",
          default: null,
        },

        /*
         * For future support of SiteItems.
         */
        siteItem: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "SiteItem",
          default: null,
        },

        /*
         * The menu/screen where the click happened.
         */
        screen: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Screen",
          default: null,
        },

        /*
         * The section/category where the product
         * was displayed.
         */
        category: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
          default: null,
        },

        /*
         * Human-readable section name if available.
         *
         * This is useful because category names can
         * change later.
         */
        categoryName: {
          type: String,
          default: null,
        },

        /*
         * Current URL.
         */
        path: {
          type: String,
          default: null,
        },

        /*
         * Product position inside the displayed grid.
         */
        position: {
          type: Number,
          default: null,
        },

        clickedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // =========================================================
    // ADVERT CLICKS
    // =========================================================

    advertClicks: [
      {
        advert: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Advert",
        },

        clickedAt: {
          type: Date,
          default: Date.now,
        },

        path: {
          type: String,
          default: null,
        },
      },
    ],

    // =========================================================
    // GENERAL
    // =========================================================

    isBot: {
      type: Boolean,
      default: false,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// =============================================================
// INDEXES
// =============================================================

sessionSchema.index(
  {
    expiresAt: 1,
  },
  {
    expireAfterSeconds: 0,
  },
);

sessionSchema.index({
  lastSeen: -1,
  isActive: 1,
});

sessionSchema.index({
  visitorId: 1,
  lastSeen: -1,
});

sessionSchema.index({
  "productClicks.menuItem": 1,
});

sessionSchema.index({
  "productClicks.category": 1,
});

sessionSchema.index({
  "productClicks.screen": 1,
});

sessionSchema.index({
  "productClicks.clickedAt": -1,
});

module.exports =
  mongoose.models.Session || mongoose.model("Session", sessionSchema);
