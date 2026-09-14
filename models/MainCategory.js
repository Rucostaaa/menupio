const mongoose = require("mongoose");

const mainCategorySchema = new mongoose.Schema(
  {
    name: {
      pt: { type: String, required: true },
      en: { type: String, required: true },
    },

    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("MainCategory", mainCategorySchema);
