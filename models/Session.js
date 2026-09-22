const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    sessionTime: Number,
    seen: {
      productsSeen: Array,
      advertsSeen: Array,
      menuItemsBought: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Cart",
      },
      advertItemsBought: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Cart",
      },
    },
    clicked: [
      {
        advert: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Advert",
        },
      },
    ],
  },

  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Session", sessionSchema);
