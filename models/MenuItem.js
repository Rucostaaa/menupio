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

    // Example:
    // {
    //   pt: "Hambúrguer de Trufa",
    //   en: "Truffle Burger",
    //   nl: "Truffelburger"
    // }
    name: {
      type: Map,
      of: String,
      default: {},
    },

    // Example:
    // {
    //   pt: "Hambúrguer artesanal com trufa...",
    //   en: "Artisan burger with truffle..."
    // }
    description: {
      type: Map,
      of: String,
      default: {},
    },

    price: {
      type: Number,
    },

    image: [String],

    // Example:
    // [
    //   {
    //     pt: "Carne de vaca",
    //     en: "Beef",
    //     nl: "Rundvlees"
    //   },
    //   {
    //     pt: "Queijo",
    //     en: "Cheese",
    //     nl: "Kaas"
    //   }
    // ]
    ingredients: [
      {
        type: Map,
        of: String,
      },
    ],

    alerts: [Number],

    allergens: [
      {
        type: Map,
        of: String,
      },
    ],

    // Example:
    // [
    //   {
    //     title: {
    //       pt: "Pequeno",
    //       en: "Small",
    //       nl: "Klein"
    //     },
    //     price: 8.5
    //   },
    //   {
    //     title: {
    //       pt: "Grande",
    //       en: "Large",
    //       nl: "Groot"
    //     },
    //     price: 12
    //   }
    // ]
    models: [
      {
        title: {
          type: Map,
          of: String,
          default: {},
        },

        price: {
          type: Number,
        },
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

    stripe: {
      connected: {
        type: Boolean,
        default: false,
      },

      productId: {
        type: String,
        default: null,
      },

      priceId: {
        type: String,
        default: null,
      },

      currency: {
        type: String,
        default: "eur",
      },

      active: {
        type: Boolean,
        default: false,
      },

      syncedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("MenuItem", menuItemSchema);
