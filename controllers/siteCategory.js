const SiteCategory = require("../models/SiteCategory");
const Restaurant = require("../models/Restaurant");
const SiteItem = require("../models/SiteItem");

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
    .populate({
      path: "siteMainCategory",
      select: "_id name",
    })
    .sort({ createdAt: 1 });

  res.json(categories);
});

const getSiteCategory = catchAsync(async (req, res) => {
  const category = await SiteCategory.findById(req.params.id)
    .populate({
      path: "placements.restaurant",
      select: "_id name",
    })
    .populate({
      path: "siteMainCategory",
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
  const existingCategory = await SiteCategory.findById(req.params.id);
  if (!existingCategory) {
    return res.status(404).json({ message: "SiteCategory not found" });
  }

  const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
  const manageableRestaurantIds = new Set();
  if (!isAdmin) {
    let hasUnmanagedPlacement = false;
    const ownedRestaurants = await Restaurant.find({
      $or: [{ owner: req.user?._id }, { employers: req.user?._id }],
    }).select("_id");
    const ownedRestaurantIds = new Set(
      ownedRestaurants.map((restaurant) => String(restaurant._id)),
    );

    for (const placement of existingCategory.placements || []) {
      const restaurantId = String(placement.restaurant);
      if (ownedRestaurantIds.has(restaurantId)) {
        manageableRestaurantIds.add(restaurantId);
      } else {
        hasUnmanagedPlacement = true;
      }
    }

    const menuItems = await SiteItem.find({
      $or: [
        { category: existingCategory._id },
        { "placements.category": existingCategory._id },
      ],
    }).select("category placements.restaurant placements.category");

    for (const item of menuItems) {
      for (const placement of item.placements || []) {
        const restaurantId = String(placement.restaurant);
        const usesCategory =
          String(item.category || "") === String(existingCategory._id) ||
          String(placement.category || "") === String(existingCategory._id);

        if (!usesCategory) continue;

        if (ownedRestaurantIds.has(restaurantId)) {
          manageableRestaurantIds.add(restaurantId);
        } else {
          hasUnmanagedPlacement = true;
        }
      }
    }

    if (manageableRestaurantIds.size === 0) {
      return res.status(403).json({
        message: "You do not have permission to update this category.",
      });
    }
    if (
      hasUnmanagedPlacement &&
      (req.body.name !== undefined ||
        req.body.siteMainCategory !== undefined ||
        req.body.image !== undefined)
    ) {
      return res.status(403).json({
        message:
          "This category is shared with another restaurant; only an administrator can edit its shared details.",
      });
    }
  }

  const updateData = {};

  if (req.body.name !== undefined) {
    updateData.name = req.body.name;
  }

  if (req.body.siteMainCategory !== undefined) {
    if (
      req.body.siteMainCategory &&
      !(await require("../models/SiteMainCategory").exists({
        _id: req.body.siteMainCategory,
      }))
    ) {
      return res.status(400).json({
        message: "The selected main category does not exist.",
      });
    }

    updateData.siteMainCategory = req.body.siteMainCategory || null;
  }

  if (req.body.placements !== undefined) {
    if (!Array.isArray(req.body.placements)) {
      return res.status(400).json({
        message: "placements must be an array.",
      });
    }
    const requestedPlacements = req.body.placements.map((placement) => {
      const restaurantId = String(
        placement?.restaurant?._id || placement?.restaurant || "",
      );
      const existingPlacement = (existingCategory.placements || []).find(
        (current) => String(current.restaurant) === restaurantId,
      );

      return {
        ...placement,
        firstToRender:
          placement.firstToRender === undefined
            ? existingPlacement?.firstToRender || false
            : placement.firstToRender === true,
        recommendations:
          placement.recommendations === undefined
            ? existingPlacement?.recommendations || []
            : placement.recommendations,
      };
    });

    for (const placement of requestedPlacements) {
      if (placement.recommendations === undefined) {
        continue;
      }
      if (!Array.isArray(placement.recommendations)) {
        return res.status(400).json({
          message: "Category recommendations must be an array.",
        });
      }

      const restaurantId = placement.restaurant?._id || placement.restaurant;
      const recommendationIds = [
        ...new Set(placement.recommendations.map(String)),
      ];
      if (
        recommendationIds.some(
          (recommendationId) =>
            !mongoose.Types.ObjectId.isValid(recommendationId),
        )
      ) {
        return res.status(400).json({
          message: "A category recommendation ID is invalid.",
        });
      }
      if (recommendationIds.includes(String(existingCategory._id))) {
        return res.status(400).json({
          message: "A category cannot recommend itself.",
        });
      }
      if (recommendationIds.length > 0) {
        const eligibleCount = await SiteCategory.countDocuments({
          _id: { $in: recommendationIds },
          "placements.restaurant": restaurantId,
        });
        if (eligibleCount !== recommendationIds.length) {
          return res.status(400).json({
            message:
              "Recommended categories must also be assigned to the same restaurant.",
          });
        }
      }
    }

    if (isAdmin) {
      updateData.placements = requestedPlacements;
    } else {
      const retainedOtherPlacements = (existingCategory.placements || []).filter(
        (placement) =>
          !manageableRestaurantIds.has(String(placement.restaurant)),
      );
      const updatedManagedPlacements = requestedPlacements.filter((placement) =>
        manageableRestaurantIds.has(
          String(placement.restaurant?._id || placement.restaurant),
        ),
      );
      updateData.placements = [
        ...retainedOtherPlacements,
        ...updatedManagedPlacements,
      ];
    }
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
  )
    .populate({
      path: "placements.restaurant",
      select: "_id name",
    })
    .populate({
      path: "siteMainCategory",
      select: "_id name",
    });

  if (!category) {
    return res.status(404).json({
      message: "SiteCategory not found",
    });
  }

  res.json(category);
});

const setFirstToRender = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { restaurantId, firstToRender } = req.body;

  if (
    !mongoose.Types.ObjectId.isValid(id) ||
    !mongoose.Types.ObjectId.isValid(restaurantId)
  ) {
    return res.status(400).json({
      success: false,
      message: "Category and restaurant IDs must be valid.",
    });
  }
  if (typeof firstToRender !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "firstToRender must be a boolean.",
    });
  }

  const category = await SiteCategory.findById(id);
  if (!category) {
    return res.status(404).json({
      success: false,
      message: "SiteCategory not found.",
    });
  }

  const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
  const restaurant = await Restaurant.findById(restaurantId).select(
    "_id owner employers",
  );
  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: "Restaurant not found.",
    });
  }
  const canManage =
    isAdmin ||
    String(restaurant.owner) === String(req.user?._id) ||
    (restaurant.employers || []).some(
      (employer) => String(employer) === String(req.user?._id),
    );
  if (!canManage) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to update this restaurant.",
    });
  }

  let categoryPlacement = category.placements.find(
    (placement) => String(placement.restaurant) === String(restaurantId),
  );

  if (!categoryPlacement) {
    const menuUsesCategory = await SiteItem.exists({
      "placements.restaurant": restaurantId,
      $or: [
        { category: category._id },
        {
          placements: {
            $elemMatch: {
              restaurant: restaurantId,
              category: category._id,
            },
          },
        },
      ],
    });

    if (canManage && menuUsesCategory) {
      category.placements.push({ restaurant: restaurantId });
      categoryPlacement = category.placements[category.placements.length - 1];
    }
  }

  if (!categoryPlacement) {
    return res.status(400).json({
      success: false,
      message: "This category is not assigned to the selected restaurant.",
    });
  }

  if (firstToRender) {
    await SiteCategory.updateMany(
      {
        _id: { $ne: category._id },
        "placements.restaurant": restaurantId,
      },
      {
        $set: { "placements.$[placement].firstToRender": false },
      },
      {
        arrayFilters: [{ "placement.restaurant": restaurantId }],
      },
    );
  }

  categoryPlacement.firstToRender = firstToRender;
  await category.save();

  return res.status(200).json({
    success: true,
    category,
  });
});

const createSiteCategory = catchAsync(async (req, res) => {
  const { name = {}, siteMainCategory = null, placements = [] } = req.body;

  if (!name || typeof name !== "object" || Array.isArray(name)) {
    return res.status(400).json({ message: "A multilingual category name is required." });
  }

  if (!Array.isArray(placements) || placements.length === 0) {
    return res.status(400).json({
      message: "At least one restaurant placement is required.",
    });
  }

  if (
    siteMainCategory &&
    !(await require("../models/SiteMainCategory").exists({
      _id: siteMainCategory,
    }))
  ) {
    return res.status(400).json({
      message: "The selected main category does not exist.",
    });
  }

  for (const placement of placements) {
    const restaurantId = placement?.restaurant;
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({ message: "Invalid restaurant placement." });
    }
    const restaurant = await Restaurant.findById(restaurantId).select(
      "_id owner employers",
    );
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found." });
    }
    const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
    const canManage =
      String(restaurant.owner) === String(req.user?._id) ||
      restaurant.employers.some(
        (employerId) => String(employerId) === String(req.user?._id),
      );
    if (!isAdmin && !canManage) {
      return res.status(403).json({
        message: "You do not have permission to assign this category to that restaurant.",
      });
    }
  }

  const category = await SiteCategory.create({
    name,
    siteMainCategory,
    placements,
  });

  const populated = await SiteCategory.findById(category._id)
    .populate("siteMainCategory", "_id name")
    .populate("placements.restaurant", "_id name");
  return res.status(201).json(populated);
});

const deleteSiteCategory = catchAsync(async (req, res) => {
  const category = await SiteCategory.findById(req.params.id);

  if (!category) {
    return res.status(404).json({
      message: "SiteCategory not found",
    });
  }

  const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
  if (!isAdmin) {
    const manageablePlacements = [];
    for (const placement of category.placements || []) {
      const restaurant = await Restaurant.findOne({
        _id: placement.restaurant,
        $or: [{ owner: req.user?._id }, { employers: req.user?._id }],
      }).select("_id");
      if (restaurant) manageablePlacements.push(placement);
    }
    if (manageablePlacements.length === 0) {
      return res.status(403).json({
        message: "You do not have permission to delete this category.",
      });
    }

    const managedIds = new Set(
      manageablePlacements.map((placement) => String(placement.restaurant)),
    );
    category.placements = (category.placements || []).filter(
      (placement) => !managedIds.has(String(placement.restaurant)),
    );
    if (category.placements.length > 0) {
      await category.save();
      return res.json({ message: "Category removed from your restaurant." });
    }
  }

  await category.deleteOne();

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
  createSiteCategory,
  placeSiteItemCategory,
  createManySiteCategory,
  getSiteCategories,
  getSiteCategory,
  updateSiteCategory,
  setFirstToRender,
  deleteSiteCategory,
  updateManySiteCategories,
  placeSiteCategory,
  removeSiteCategoryPlacement,
  updateSiteCategoryImage,
  updateImageSettings,
};
