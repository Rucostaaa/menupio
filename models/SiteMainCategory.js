const mongoose = require("mongoose");

const siteMainCategorySchema = new mongoose.Schema(
  {
    name: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

module.exports =
  mongoose.models.SiteMainCategory ||
  mongoose.model("SiteMainCategory", siteMainCategorySchema);
