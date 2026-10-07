const mongoose = require("mongoose");
const SiteItem = require("../models/SiteItem");
const SiteCategory = require("../models/SiteCategory");

const toIdList = (value) => {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const ids = list
    .map((entry) => String(entry?._id || entry?.id || entry || ""))
    .filter((id) => mongoose.Types.ObjectId.isValid(id));

  return [...new Set(ids)];
};

const getLoyaltyConfig = (restaurant) => {
  const config = Array.isArray(restaurant?.fidelization)
    ? restaurant.fidelization[0]
    : restaurant?.fidelization;

  return config || null;
};

// Items directly chosen by the restaurant, including the legacy single item.
const getConfiguredItemIds = (config) =>
  toIdList([config?.menuItem, ...(config?.siteItems || [])]);

const getConfiguredCategoryIds = (config) =>
  toIdList(config?.siteCategories || []);

const hasLoyaltyTargets = (config) =>
  getConfiguredItemIds(config).length > 0 ||
  getConfiguredCategoryIds(config).length > 0;

// Every SiteItem of the restaurant that earns loyalty stamps.
const findEligibleSiteItems = async (restaurant, select = "_id name images") => {
  const config = getLoyaltyConfig(restaurant);
  const itemIds = getConfiguredItemIds(config);
  const categoryIds = getConfiguredCategoryIds(config);

  if (!itemIds.length && !categoryIds.length) {
    return [];
  }

  const items = await SiteItem.find({
    "placements.restaurant": restaurant._id,
  }).select(`${select} category placements`);

  const itemSet = new Set(itemIds);
  const categorySet = new Set(categoryIds);

  return items.filter((item) => {
    if (itemSet.has(String(item._id))) return true;

    const placement = item.placements?.find(
      (entry) => String(entry.restaurant) === String(restaurant._id),
    );
    const categoryId = placement?.category || item.category;

    return categoryId ? categorySet.has(String(categoryId)) : false;
  });
};

// Validates and normalizes loyalty targets sent by the client.
// Fields left undefined keep the stored value.
const resolveLoyaltyTargets = async (restaurant, input = {}) => {
  const current = getLoyaltyConfig(restaurant);

  const menuItem =
    input.menuItem !== undefined
      ? toIdList(input.menuItem)[0] || null
      : current?.menuItem || null;
  const siteItems =
    input.siteItems !== undefined
      ? toIdList(input.siteItems)
      : toIdList(current?.siteItems || []);
  const siteCategories =
    input.siteCategories !== undefined
      ? toIdList(input.siteCategories)
      : toIdList(current?.siteCategories || []);

  const itemIds = toIdList([menuItem, ...siteItems]);

  if (itemIds.length) {
    const owned = await SiteItem.countDocuments({
      _id: { $in: itemIds },
      "placements.restaurant": restaurant._id,
    });

    if (owned !== itemIds.length) {
      const error = new Error(
        "All loyalty products must belong to this restaurant.",
      );
      error.statusCode = 400;
      throw error;
    }
  }

  if (siteCategories.length) {
    const found = await SiteCategory.countDocuments({
      _id: { $in: siteCategories },
    });

    if (found !== siteCategories.length) {
      const error = new Error("One or more loyalty categories do not exist.");
      error.statusCode = 400;
      throw error;
    }
  }

  return { menuItem, siteItems, siteCategories };
};

module.exports = {
  toIdList,
  getLoyaltyConfig,
  getConfiguredItemIds,
  getConfiguredCategoryIds,
  hasLoyaltyTargets,
  findEligibleSiteItems,
  resolveLoyaltyTargets,
};
