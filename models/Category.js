const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    name: { pt: String, en: String },
    ownID: Number,
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    mainImage: {
      type: String,
    },
    featured: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Category", categorySchema);
