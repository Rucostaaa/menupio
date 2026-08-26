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

  console.log("PRODUCT ID:", id);

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

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "products",
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

  product.image = [result.secure_url];

  await product.save();

  res.json(product);
});
