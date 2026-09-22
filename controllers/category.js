const cloudinary = require("../utils/Claudinary");
const catchAsync = require("../utils/catchAsync");
const Category = require("../models/Category");
const MainCategory = require("../models/MainCategory");
exports.createCategory = catchAsync(async (req, res) => {
  const { name, featured } = req.body;
  const user = req.user._id;
  console.log(user);

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Category name is required",
    });
  }

  const lastCategory = await Category.findOne({
    user,
  }).sort({ ownID: -1 });
  console.log(lastCategory);
  const ownID = lastCategory ? lastCategory.ownID + 1 : 1;

  const category = await Category.create({
    name,
    featured,
    user,
    ownID,
  });

  res.status(201).json(category);
});

exports.getCategories = catchAsync(async (req, res) => {
  const user = req.user._id;

  const filter = {};

  if (user) {
    filter.user = user;
  }

  const categories = await Category.find(filter).sort({
    ownID: 1,
  });

  res.status(200).json(categories);
});

exports.updateCategory = catchAsync(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return res.status(404).json({
      success: false,
      message: "Category not found",
    });
  }

  category.name = req.body.name || category.name;

  await category.save();

  res.status(200).json(category);
});

exports.updateCategories = catchAsync(async (req, res) => {
  const { categories } = req.body;

  if (!Array.isArray(categories)) {
    return res.status(400).json({
      success: false,
      message: "categories must be an array",
    });
  }

  const updatedCategories = await Promise.all(
    categories.map((category) =>
      Category.findByIdAndUpdate(
        category._id,
        {
          name: category.name,
          ownID: category.ownID,
          featured: category.featured,
        },
        {
          new: true,
        },
      ),
    ),
  );

  res.status(200).json(updatedCategories);
});

exports.deleteCategory = catchAsync(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return res.status(404).json({
      success: false,
      message: "Category not found",
    });
  }

  await category.deleteOne();

  res.status(200).json({
    success: true,
    message: "Category deleted successfully",
  });
});
exports.reorderCategories = catchAsync(async (req, res) => {
  const categories = req.body;

  await Promise.all(
    categories.map((category) =>
      Category.findByIdAndUpdate(
        category.id,

        {
          ownID: category.ownID,
        },
      ),
    ),
  );

  res.json({
    success: true,
  });
});
exports.updateCategoryImage = catchAsync(async (req, res) => {
  const { id } = req.params;

  const category = await Category.findById(id);

  if (!category) {
    return res.status(404).json({
      message: "Category not found",
    });
  }

  if (!req.file) {
    return res.status(400).json({
      message: "Please upload an image",
    });
  }

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "categories",
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      },
    );

    stream.end(req.file.buffer);
  });

  category.image = [result.secure_url];

  await category.save();

  res.json(category);
});
// Main Categories
exports.getBusinessMainCategories = catchAsync(async (req, res) => {
  const user = req.params._id;

  const filter = {};

  if (user) {
    filter.user = user;
  }

  const mainCategories = await MainCategory.find(filter)
    .populate({
      path: "categories",
      select: "name image ownID",
    })
    .sort({
      order: 1,
      createdAt: 1,
    });

  res.status(200).json(mainCategories);
});
// POST /category/main-category
exports.createMainCategory = async (req, res) => {
  try {
    const { name, categories = [] } = req.body;
    const user = req?.user?._id;

    if (!name?.pt || !name?.en) {
      return res.status(400).json({
        message: "Main category name is required",
      });
    }

    if (!Array.isArray(categories)) {
      return res.status(400).json({
        message: "Categories must be an array",
      });
    }

    // Validate category IDs
    if (categories.length > 0) {
      const validCategories = await Category.find({
        _id: { $in: categories },
        user,
      }).select("_id");

      if (validCategories.length !== categories.length) {
        return res.status(400).json({
          message: "One or more category IDs are invalid",
        });
      }
    }

    // Get the next order for this user
    const lastMainCategory = await MainCategory.findOne({
      user,
    })
      .sort({
        order: -1,
      })
      .populate("category");

    const order = lastMainCategory ? lastMainCategory.order + 1 : 0;

    const mainCategory = await MainCategory.create({
      name: {
        pt: name.pt,
        en: name.en,
      },
      categories,
      user,
      order,
    });

    await mainCategory.populate("categories");

    return res.status(201).json(mainCategory);
  } catch (error) {
    console.error("createMainCategory:", error);

    return res.status(500).json({
      message: "Failed to create main category",
      error: error.message,
    });
  }
};
// PUT /category/main-category/:id
exports.updateMainCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, categories } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid main category ID",
      });
    }

    const mainCategory = await MainCategory.findById(id);

    if (!mainCategory) {
      return res.status(404).json({
        message: "Main category not found",
      });
    }

    if (name !== undefined) {
      if (typeof name !== "object" || Array.isArray(name)) {
        return res.status(400).json({
          message: "Name must be an object",
        });
      }

      mainCategory.name = {
        pt: name.pt ?? mainCategory.name.pt,
        en: name.en ?? mainCategory.name.en,
      };
    }

    if (categories !== undefined) {
      if (!Array.isArray(categories)) {
        return res.status(400).json({
          message: "Categories must be an array",
        });
      }

      const invalidIds = categories.filter(
        (categoryId) => !mongoose.Types.ObjectId.isValid(categoryId),
      );

      if (invalidIds.length > 0) {
        return res.status(400).json({
          message: "One or more category IDs are invalid",
        });
      }

      const validCategories = await Category.find({
        _id: { $in: categories },
      }).select("_id");

      if (validCategories.length !== categories.length) {
        return res.status(400).json({
          message: "One or more category IDs do not exist",
        });
      }

      mainCategory.categories = categories;
    }

    await mainCategory.save();
    await mainCategory.populate("categories");

    return res.status(200).json(mainCategory);
  } catch (error) {
    console.error("updateMainCategory:", error);

    return res.status(500).json({
      message: "Failed to update main category",
      error: error.message,
    });
  }
};
// PUT /category/main-category
exports.updateMainCategories = async (req, res) => {
  try {
    const { mainCategories } = req.body;

    if (!Array.isArray(mainCategories)) {
      return res.status(400).json({
        message: "mainCategories must be an array",
      });
    }

    for (const mainCategory of mainCategories) {
      if (!mongoose.Types.ObjectId.isValid(mainCategory._id)) {
        return res.status(400).json({
          message: `Invalid main category ID: ${mainCategory._id}`,
        });
      }

      if (mainCategory.categories !== undefined) {
        if (!Array.isArray(mainCategory.categories)) {
          return res.status(400).json({
            message: `Categories must be an array for ${mainCategory._id}`,
          });
        }

        const invalidIds = mainCategory.categories.filter(
          (categoryId) => !mongoose.Types.ObjectId.isValid(categoryId),
        );

        if (invalidIds.length > 0) {
          return res.status(400).json({
            message: "One or more category IDs are invalid",
          });
        }
      }
    }

    const operations = mainCategories.map((mainCategory) => {
      const update = {};

      if (mainCategory.name !== undefined) {
        update.name = mainCategory.name;
      }

      if (mainCategory.categories !== undefined) {
        update.categories = mainCategory.categories;
      }

      return {
        updateOne: {
          filter: { _id: mainCategory._id },
          update: { $set: update },
        },
      };
    });

    await MainCategory.bulkWrite(operations);

    const updatedMainCategories = await MainCategory.find()
      .populate("categories")
      .sort({ createdAt: 1 });

    return res.status(200).json(updatedMainCategories);
  } catch (error) {
    console.error("updateMainCategories:", error);

    return res.status(500).json({
      message: "Failed to update main categories",
      error: error.message,
    });
  }
};
// DELETE /category/main-category/:id
exports.deleteMainCategory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid main category ID",
      });
    }

    const mainCategory = await MainCategory.findByIdAndDelete(id);

    if (!mainCategory) {
      return res.status(404).json({
        message: "Main category not found",
      });
    }

    return res.status(200).json({
      message: "Main category deleted successfully",
      mainCategory,
    });
  } catch (error) {
    console.error("deleteMainCategory:", error);

    return res.status(500).json({
      message: "Failed to delete main category",
      error: error.message,
    });
  }
};
exports.getBusinessMainCategory = catchAsync(async (req, res) => {
  const user = req.params._id;

  const filter = {};

  if (user) {
    filter.user = user;
  }

  const mainCategories = await MainCategory.find(filter).sort({
    ownID: 1,
  });

  res.status(200).json(mainCategories);
});

exports.getMainCategories = catchAsync(async (req, res) => {
  const user = req.user._id;

  const filter = {};

  if (user) {
    filter.user = user;
  }

  const mainCategories = await MainCategory.find(filter)
    .sort({
      ownID: 1,
    })
    .populate("categories");

  res.status(200).json(mainCategories);
});
