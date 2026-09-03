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
exports.createProductsBulk = catchAsync(async (req, res) => {
  const products = Array.isArray(req.body) ? req.body : req.body?.products;

  if (!Array.isArray(products)) {
    return res.status(400).json({
      success: false,
      message: "Products must be an array",
    });
  }

  if (products.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Products array cannot be empty",
    });
  }

  const results = {
    created: [],
    updated: [],
  };

  for (const product of products) {
    const namePt = product?.name?.pt?.trim();

    if (!namePt) {
      return res.status(400).json({
        success: false,
        message: "Every product must have a Portuguese name",
      });
    }

    // Don't allow the client to control these fields
    const { _id, id, owner, ...productData } = product;

    // Normalize
    productData.name = {
      pt: productData.name?.pt?.trim() || "",
      en: productData.name?.en?.trim() || "",
    };

    productData.models = Array.isArray(productData.models)
      ? productData.models
      : [];

    productData.allergens = Array.isArray(productData.allergens)
      ? productData.allergens
      : [];

    productData.available =
      typeof productData.available === "boolean" ? productData.available : true;

    // Find existing product by trimmed PT name
    const existingProduct = await MenuItem.findOne({
      owner: req.user._id,
      "name.pt": {
        $regex: `^${namePt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        $options: "i",
      },
    });

    if (existingProduct) {
      Object.assign(existingProduct, productData);

      await existingProduct.save();

      results.updated.push(existingProduct);
    } else {
      const newProduct = await MenuItem.create({
        ...productData,
        owner: req.user._id,
      });

      results.created.push(newProduct);
    }
  }

  res.status(200).json({
    success: true,
    createdCount: results.created.length,
    updatedCount: results.updated.length,
    created: results.created,
    updated: results.updated,
  });
});
