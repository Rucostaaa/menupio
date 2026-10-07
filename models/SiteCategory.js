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
        firstToRender: {
          type: Boolean,
          default: false,
        },
        recommendations: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SiteCategory",
          },
        ],
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
