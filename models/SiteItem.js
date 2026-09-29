const mongoose = require("mongoose");

const siteItemSchema = new mongoose.Schema(
  {
    placements: [
      {
        restaurant: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Restaurant",
        },
        name: {
          type: Map,
          of: String,
          default: {},
        },
        price: Number,
        category: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "SiteCategory",
        },
        description: {
          type: Map,
          of: String,
          default: {},
        },
        ingredients: {
          type: [String],
          default: [],
        },
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
        imageSettings: {
          h: {
            type: String,
            default: "105%",
          },

          w: {
            type: String,
            default: "105%",
          },

          translateX: {
            type: String,
            default: "14%",
          },

          translateY: {
            type: String,
            default: "2%",
          },
        },

        alerts: [Number],
        image: [
          {
            type: mongoose.Schema.Types.Mixed,
            validate: {
              validator: function (value) {
                return (
                  typeof value === "string" || mongoose.isValidObjectId(value)
                );
              },
              message:
                "Image must be a Cloudinary URL or a valid Image ObjectId",
            },
          },
        ],
        images: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Image",
          },
        ],
      },
    ],
    name: {
      type: Map,
      of: String,
      default: {},
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SiteCategory",
    },
    description: {
      type: Map,
      of: String,
      default: {},
    },
    image: [
      {
        type: mongoose.Schema.Types.Mixed,
        validate: {
          validator: function (value) {
            return typeof value === "string" || mongoose.isValidObjectId(value);
          },
          message: "Image must be a Cloudinary URL or a valid Image ObjectId",
        },
      },
    ],
    images: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Image",
      },
    ],
    ingredients: {
      type: [String],
      default: [],
    },
    alerts: [Number],
    allergens: [
      {
        type: Map,
        of: String,
      },
    ],
  },
  {
    timestamps: true,
  },
);

module.exports =
  mongoose.models.SiteItem || mongoose.model("SiteItem", siteItemSchema);
