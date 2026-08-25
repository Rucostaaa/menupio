const MenuItem = require("../models/MenuItem");
const cloudinary = require("../utils/Claudinary");
const catchAsync = require("../utils/catchAsync");

exports.createMenuItem = catchAsync(async (req, res) => {
  const item = await MenuItem.create({
    ...req.body,
    owner: req.user._id,
  });

  res.status(201).json(item);
});

exports.getMenuItems = catchAsync(async (req, res) => {
  const items = await MenuItem.find({ owner: req.user._id }).populate({
    path: "category",
  });

  res.json(items);
});

exports.getMenuItem = catchAsync(async (req, res) => {
  const item = await MenuItem.findById(req.params.id);

  res.json(item);
});

exports.updateMenuItem = catchAsync(async (req, res) => {
  const item = await MenuItem.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });

  res.json(item);
});

exports.deleteMenuItem = catchAsync(async (req, res) => {
  await MenuItem.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
  });
});
exports.updateImage = catchAsync(async (req, res) => {
  const { id } = req.params;
  console.log(id);

  const product = await MenuItem.findById(id);

  if (!product) {
    return res.status(404).json({
      message: "Product not found",
    });
  }

  if (!req.file) {
    return res.status(400).json({
      message: "Please upload an image",
    });
  }

  const result = await cloudinary.uploader.upload(req.file.path, {
    folder: "products",
  });

  product.image[0] = result.secure_url;

  await product.save();

  res.json(product);
});
exports.bulkCreateMenuItems = async (req, res) => {
  console.log(req.body);

  try {
    // Body MUST be an array
    if (!Array.isArray(req.body)) {
      return res.status(400).json({
        message: "Request body must be an array of products.",
      });
    }

    if (req.body.length === 0) {
      return res.status(400).json({
        message: "Products array cannot be empty.",
      });
    }

    // Prepare products
    const products = req.body.map((product) => ({
      ...product,

      // Never trust owner coming from the client
      owner: req.user._id,

      // If your auth user contains restaurantId, use it automatically
      ...(req.user.restaurantId
        ? {
            restaurantId: req.user.restaurantId,
          }
        : {}),
    }));

    const createdProducts = await MenuItem.insertMany(products);

    return res.status(201).json(createdProducts);
  } catch (error) {
    console.error("Bulk create menu items error:", error);

    return res.status(500).json({
      message: "Failed to create products.",
      error: error.message,
    });
  }
};
