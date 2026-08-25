const cloudinary = require("../utils/Claudinary");
const catchAsync = require("../utils/catchAsync");
const Category = require("../models/Category");
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
  console.log(id);

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

  const result = await cloudinary.uploader.upload(req.file.path, {
    folder: "categories",
  });

  category.image[0] = result.secure_url;

  await category.save();

  res.json(category);
});
