const SiteMainCategory = require("../models/SiteMainCategory");
const SiteCategory = require("../models/SiteCategory");
const catchAsync = require("../utils/catchAsync");
const mongoose = require("mongoose");
const getSiteMainCategories = async (req, res) => {
  try {
    const mainCategories = await SiteMainCategory.find()
      .sort({ createdAt: -1 })
      .lean();

    const mainCategoryIds = mainCategories.map((item) => item._id);

    const categories = await SiteCategory.find({
      siteMainCategory: { $in: mainCategoryIds },
    })
      .select("_id name image siteMainCategory")
      .lean();

    const categoriesByMainCategory = {};

    categories.forEach((category) => {
      const mainCategoryId = String(category.siteMainCategory);

      if (!categoriesByMainCategory[mainCategoryId]) {
        categoriesByMainCategory[mainCategoryId] = [];
      }

      categoriesByMainCategory[mainCategoryId].push(category);
    });

    const result = mainCategories.map((mainCategory) => ({
      ...mainCategory,
      categories: categoriesByMainCategory[String(mainCategory._id)] || [],
    }));

    res.status(200).json(result);
  } catch (error) {
    console.error("SERVER ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Erro ao buscar SiteMainCategories",
      error: error.message,
    });
  }
};

const getSiteMainCategory = catchAsync(async (req, res) => {
  const mainCategory = await SiteMainCategory.findById(req.params.id).populate({
    path: "categories",
    select: "_id name image placements",
    populate: {
      path: "placements.restaurant",
      select: "_id name",
    },
  });

  if (!mainCategory) {
    return res.status(404).json({
      message: "SiteMainCategory not found",
    });
  }

  res.json(mainCategory);
});

const createManySiteMainCategory = catchAsync(async (req, res) => {
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

  const mainCategories = req.body.map((item) => ({
    name: item.name || {},
    categories: [],
  }));

  const created = await SiteMainCategory.insertMany(mainCategories);

  res.status(201).json({
    message: "SiteMainCategories created successfully.",
    count: {
      created: created.length,
    },
    created,
  });
});

const updateManySiteMainCategories = catchAsync(async (req, res) => {
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
    };

    // ----------------------------------------------------------
    // EXISTING MAIN CATEGORY
    // ----------------------------------------------------------

    if (item._id) {
      const mainCategory = await SiteMainCategory.findByIdAndUpdate(
        item._id,
        updateData,
        {
          new: true,
          runValidators: true,
        },
      );

      if (!mainCategory) {
        return res.status(404).json({
          message: `SiteMainCategory ${item._id} not found.`,
        });
      }

      updated.push(mainCategory);
      continue;
    }

    // ----------------------------------------------------------
    // NEW MAIN CATEGORY
    // ----------------------------------------------------------

    const mainCategory = await SiteMainCategory.create({
      ...updateData,
      categories: [],
    });

    created.push(mainCategory);
  }

  res.json({
    message: "SiteMainCategories bulk operation completed.",
    count: {
      updated: updated.length,
      created: created.length,
    },
    updated,
    created,
  });
});

const updateSiteMainCategory = catchAsync(async (req, res) => {
  const updateData = {};

  if (req.body.name !== undefined) {
    updateData.name = req.body.name;
  }

  const mainCategory = await SiteMainCategory.findByIdAndUpdate(
    req.params.id,
    updateData,
    {
      new: true,
      runValidators: true,
    },
  ).populate({
    path: "categories",
    select: "_id name image placements",
  });

  if (!mainCategory) {
    return res.status(404).json({
      message: "SiteMainCategory not found",
    });
  }

  res.json(mainCategory);
});

const deleteSiteMainCategory = catchAsync(async (req, res) => {
  const mainCategory = await SiteMainCategory.findByIdAndDelete(req.params.id);

  if (!mainCategory) {
    return res.status(404).json({
      message: "SiteMainCategory not found.",
    });
  }

  res.json({
    message: "SiteMainCategory deleted successfully.",
  });
});

const addCategoryToMainCategory = async (req, res) => {
  try {
    const { siteMainCategoryId } = req.params;
    const { categoryIds } = req.body;

    // =========================================================
    // VALIDATE MAIN CATEGORY ID
    // =========================================================

    if (
      !siteMainCategoryId ||
      !mongoose.Types.ObjectId.isValid(siteMainCategoryId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid SiteMainCategory ID",
      });
    }

    // =========================================================
    // VALIDATE CATEGORY IDS
    // =========================================================

    if (!Array.isArray(categoryIds)) {
      return res.status(400).json({
        success: false,
        message: "categoryIds must be an array",
      });
    }

    // Remove duplicates and invalid/empty values
    const uniqueCategoryIds = [
      ...new Set(categoryIds.filter(Boolean).map(String)),
    ];

    if (uniqueCategoryIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one category ID is required",
      });
    }

    const invalidIds = uniqueCategoryIds.filter(
      (categoryId) => !mongoose.Types.ObjectId.isValid(categoryId),
    );

    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "One or more category IDs are invalid",
        invalidIds,
      });
    }

    // =========================================================
    // CHECK MAIN CATEGORY EXISTS
    // =========================================================

    const siteMainCategory =
      await SiteMainCategory.findById(siteMainCategoryId);

    if (!siteMainCategory) {
      return res.status(404).json({
        success: false,
        message: "SiteMainCategory not found",
      });
    }

    // =========================================================
    // CHECK SITE CATEGORIES EXIST
    // =========================================================

    const categories = await SiteCategory.find({
      _id: {
        $in: uniqueCategoryIds,
      },
    });

    if (categories.length !== uniqueCategoryIds.length) {
      const foundIds = new Set(
        categories.map((category) => String(category._id)),
      );

      const missingIds = uniqueCategoryIds.filter(
        (categoryId) => !foundIds.has(String(categoryId)),
      );

      return res.status(404).json({
        success: false,
        message: "One or more SiteCategories were not found",
        missingIds,
      });
    }

    // =========================================================
    // ASSIGN MAIN CATEGORY
    // =========================================================

    const result = await SiteCategory.updateMany(
      {
        _id: {
          $in: uniqueCategoryIds,
        },
      },
      {
        $set: {
          siteMainCategory: siteMainCategoryId,
        },
      },
    );

    // =========================================================
    // RESPONSE
    // =========================================================

    return res.status(200).json({
      success: true,
      message: "SiteCategories attached to SiteMainCategory successfully",
      siteMainCategory: {
        _id: siteMainCategory._id,
        name: siteMainCategory.name,
      },
      categoryIds: uniqueCategoryIds,
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("addCategoryToMainCategory error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to attach categories to SiteMainCategory",
      error: error.message,
    });
  }
};

const removeCategoryFromMainCategory = catchAsync(async (req, res) => {
  const { id, categoryId } = req.params;

  const mainCategory = await SiteMainCategory.findById(id);

  if (!mainCategory) {
    return res.status(404).json({
      message: "SiteMainCategory not found.",
    });
  }

  mainCategory.categories = mainCategory.categories.filter(
    (existingCategoryId) => String(existingCategoryId) !== String(categoryId),
  );

  await mainCategory.save();

  const populated = await SiteMainCategory.findById(mainCategory._id).populate({
    path: "categories",
    select: "_id name image placements",
    populate: {
      path: "placements.restaurant",
      select: "_id name",
    },
  });

  res.json({
    message: "SiteCategory removed from SiteMainCategory successfully.",
    mainCategory: populated,
  });
});

module.exports = {
  createManySiteMainCategory,
  getSiteMainCategories,
  getSiteMainCategory,
  updateSiteMainCategory,
  deleteSiteMainCategory,
  updateManySiteMainCategories,
  addCategoryToMainCategory,
  removeCategoryFromMainCategory,
};
