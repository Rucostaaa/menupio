const mongoose = require("mongoose");

const siteCategorySchema = new mongoose.Schema(
  {
    name: {
      type: Map,
      of: String,
      default: {},
    },

    image: [
      {
        type: String,
      },
    ],

    imageSettings: {
      h: String,
      w: String,
      translateX: String,
      translateY: String,
    },

    siteMainCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SiteMainCategory",
    },
    placements: [
      {
        restaurant: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Restaurant",
        },
      },
    ],
  },
  {
    timestamps: true,
  },
);

module.exports =
  mongoose.models.SiteCategory ||
  mongoose.model("SiteCategory", siteCategorySchema);
