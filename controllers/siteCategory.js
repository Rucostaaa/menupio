const SiteCategory = require("../models/siteCategory");
const Restaurant = require("../models/restaurant");
const SiteItem = require("../models/siteItem");

const catchAsync = require("../utils/catchAsync");
const cloudinary = require("../utils/Claudinary");
const mongoose = require("mongoose");
const uploadBufferToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      },
    );

    uploadStream.end(buffer);
  });
};

const updateSiteCategoryImage = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    return res.status(400).json({
      message: "Image is required.",
    });
  }

  const category = await SiteCategory.findById(id);

  if (!category) {
    return res.status(404).json({
      message: "SiteCategory not found.",
    });
  }

  const result = await uploadBufferToCloudinary(req.file.buffer, {
    folder: "site-categories",
    resource_type: "image",
  });

  if (!result?.secure_url) {
    return res.status(500).json({
      message: "Image upload failed.",
    });
  }

  if (!Array.isArray(category.image)) {
    category.image = [];
  }

  category.image[0] = result.secure_url;

  await category.save();

  return res.status(200).json({
    message: "SiteCategory image updated successfully.",
    category,
  });
});

module.exports = {
  updateSiteCategoryImage,
};
const getSiteCategories = catchAsync(async (req, res) => {
  const categories = await SiteCategory.find()
    .populate({
      path: "placements.restaurant",
      select: "_id name",
    })
    .sort({ createdAt: 1 });

  res.json(categories);
});

const getSiteCategory = catchAsync(async (req, res) => {
  const category = await SiteCategory.findById(req.params.id).populate({
    path: "placements.restaurant",
    select: "_id name",
  });

  if (!category) {
    return res.status(404).json({
      message: "SiteCategory not found",
    });
  }

  res.json(category);
});

const createManySiteCategory = catchAsync(async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({
      message: "Request body must be an array.",
    });
  }

  if (req.body.length === 0) {
    return res.status(400).json({
      message: "Request body cannot be empty.",
    });
  }

  const categories = req.body.map((item) => ({
    name: item.name || {},
    image: Array.isArray(item.image) ? item.image : [],
    placements: [],
  }));

  const created = await SiteCategory.insertMany(categories);

  res.status(201).json({
    message: "SiteCategories created successfully.",
    count: {
      created: created.length,
    },
    created,
  });
});

const updateManySiteCategories = catchAsync(async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({
      message: "Request body must be an array.",
    });
  }

  if (req.body.length === 0) {
    return res.status(400).json({
      message: "Request body cannot be empty.",
    });
  }

  const updated = [];
  const created = [];

  for (const item of req.body) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return res.status(400).json({
        message: "Every item in the bulk request must be an object.",
      });
    }

    const updateData = {
      name: item.name || {},
      image: Array.isArray(item.image) ? item.image : [],
    };

    // ----------------------------------------------------------
    // EXISTING SITE CATEGORY
    // ----------------------------------------------------------

    if (item._id) {
      const category = await SiteCategory.findByIdAndUpdate(
        item._id,
        updateData,
        {
          new: true,
          runValidators: true,
        },
      );

      if (!category) {
        return res.status(404).json({
          message: `SiteCategory ${item._id} not found.`,
        });
      }

      updated.push(category);
      continue;
    }

    // ----------------------------------------------------------
    // NEW SITE CATEGORY
    // ----------------------------------------------------------

    const category = await SiteCategory.create({
      ...updateData,
      placements: [],
    });

    created.push(category);
  }

  res.json({
    message: "SiteCategories bulk operation completed.",
    count: {
      updated: updated.length,
      created: created.length,
    },
    updated,
    created,
  });
});

const updateSiteCategory = catchAsync(async (req, res) => {
  const updateData = {};

  if (req.body.name !== undefined) {
    updateData.name = req.body.name;
  }

  if (req.body.image !== undefined) {
    updateData.image = Array.isArray(req.body.image) ? req.body.image : [];
  }

  const category = await SiteCategory.findByIdAndUpdate(
    req.params.id,
    updateData,
    {
      new: true,
      runValidators: true,
    },
  ).populate({
    path: "placements.restaurant",
    select: "_id name",
  });

  if (!category) {
    return res.status(404).json({
      message: "SiteCategory not found",
    });
  }

  res.json(category);
});

const deleteSiteCategory = catchAsync(async (req, res) => {
  const category = await SiteCategory.findByIdAndDelete(req.params.id);

  if (!category) {
    return res.status(404).json({
      message: "SiteCategory not found",
    });
  }

  // Remove this category from every SiteMainCategory
  const SiteMainCategory = require("../models/siteMainCategory");

  await SiteMainCategory.updateMany(
    {
      categories: req.params.id,
    },
    {
      $pull: {
        categories: req.params.id,
      },
    },
  );

  res.json({
    message: "SiteCategory deleted successfully.",
  });
});

const placeSiteCategory = catchAsync(async (req, res) => {
  const { restaurant } = req.body;

  if (!restaurant) {
    return res.status(400).json({
      message: "restaurant is required.",
    });
  }

  const restaurantExists = await Restaurant.exists({
    _id: restaurant,
  });

  if (!restaurantExists) {
    return res.status(404).json({
      message: "Restaurant not found.",
    });
  }

  const category = await SiteCategory.findById(req.params.id);

  if (!category) {
    return res.status(404).json({
      message: "SiteCategory not found.",
    });
  }

  const alreadyPlaced = category.placements.some(
    (placement) => String(placement.restaurant) === String(restaurant),
  );

  if (!alreadyPlaced) {
    category.placements.push({
      restaurant,
    });

    await category.save();
  }

  const populated = await SiteCategory.findById(category._id).populate({
    path: "placements.restaurant",
    select: "_id name",
  });

  res.json({
    message: "SiteCategory placed successfully.",
    category: populated,
  });
});

const removeSiteCategoryPlacement = catchAsync(async (req, res) => {
  const { id, restaurantId } = req.params;

  const category = await SiteCategory.findById(id);

  if (!category) {
    return res.status(404).json({
      message: "SiteCategory not found.",
    });
  }

  category.placements = category.placements.filter(
    (placement) => String(placement.restaurant) !== String(restaurantId),
  );

  await category.save();

  res.json({
    message: "SiteCategory placement removed successfully.",
    category,
  });
});
const placeSiteItemCategory = catchAsync(async (req, res) => {
  const { productIds, categoryId } = req.body;
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return res.status(400).json({
      message: "Product IDs are required and must be an array.",
    });
  }

  const category = await SiteCategory.findById(categoryId);

  if (!category) {
    return res.status(404).json({
      message: "SiteCategory not found.",
    });
  }

  const siteItems = await SiteItem.find({
    _id: { $in: productIds },
  });
  if (siteItems.length !== productIds.length) {
    return res.status(404).json({
      message: "Not all products were found.",
    });
  }

  const assignedProducts = [];
  const skippedProducts = [];

  for (const product of siteItems) {
    // Already assigned to this category → skip
    if (
      product.category &&
      product.category.toString() === categoryId.toString()
    ) {
      skippedProducts.push(product);
      continue;
    }

    // Assign product to this category
    product.category = categoryId;

    await product.save();

    assignedProducts.push(product);
  }
  return res.status(200).json({
    message: "SiteItems processed successfully.",
    category,
    assignedProducts,
    skippedProducts,
  });
});

const updateImageSettings = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid SiteCategory id.",
      });
    }

    const { h, w, translateX, translateY } = req.body;

    const category = await SiteCategory.findById(id);

    if (!category) {
      return res.status(404).json({
        message: "SiteCategory not found.",
      });
    }

    /*
     * ---------------------------------------------------------
     * DEFAULTS
     * ---------------------------------------------------------
     */

    const currentSettings = category.imageSettings || {};

    category.imageSettings = {
      h: typeof h === "string" ? h : currentSettings.h || "75%",

      w: typeof w === "string" ? w : currentSettings.w || "75%",

      translateX:
        typeof translateX === "string"
          ? translateX
          : currentSettings.translateX || "0%",

      translateY:
        typeof translateY === "string"
          ? translateY
          : currentSettings.translateY || "15%",
    };

    await category.save();

    return res.status(200).json({
      success: true,
      message: "Category image settings updated successfully.",
      category,
      imageSettings: category.imageSettings,
    });
  } catch (error) {
    console.error("UPDATE SITE CATEGORY IMAGE SETTINGS ERROR:", error);

    return res.status(500).json({
      message: "Unable to update category image settings.",
    });
  }
};

module.exports = {
  placeSiteItemCategory,
  createManySiteCategory,
  getSiteCategories,
  getSiteCategory,
  updateSiteCategory,
  deleteSiteCategory,
  updateManySiteCategories,
  placeSiteCategory,
  removeSiteCategoryPlacement,
  updateSiteCategoryImage,
  updateImageSettings,
};
