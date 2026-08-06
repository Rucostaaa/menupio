const Restaurant = require("../models/Restaurant");
const cloudinary = require("../utils/Claudinary");
const catchAsync = require("../utils/catchAsync");

exports.createRestaurant = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.create({
    ...req.body,
    owner: req.user._id,
  });
  console.log(restaurant);

  res.status(201).json(restaurant);
});

exports.getRestaurants = catchAsync(async (req, res) => {
  const restaurants = await Restaurant.find().populate("owner");

  res.json(restaurants);
});

exports.getRestaurant = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id);

  res.json(restaurant);
});

exports.updateRestaurant = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findByIdAndUpdate(
    req.params.id,
    req.body,
    {
      new: true,
    },
  );

  res.json(restaurant);
});

exports.deleteRestaurant = catchAsync(async (req, res) => {
  await Restaurant.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
  });
});
exports.updateLogo = catchAsync(async (req, res) => {
  const { id } = req.params;
  console.log(id);
  const restaurant = await Restaurant.findById(id);

  if (!restaurant) {
    return res.status(404).json({
      message: "Business not found",
    });
  }

  if (!req.file) {
    return res.status(400).json({
      message: "Please upload an image",
    });
  }

  const result = await cloudinary.uploader.upload(req.file.path, {
    folder: "logo",
  });

  restaurant.logo = result.secure_url;

  await restaurant.save();

  res.json(restaurant);
});
