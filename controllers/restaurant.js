const Restaurant = require("../models/Restaurant");
const cloudinary = require("../utils/Claudinary");
const catchAsync = require("../utils/catchAsync");

// ============================================================
// CLOUDINARY HELPERS
// ============================================================

const extractCloudinaryPublicId = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== "string") {
    return null;
  }

  try {
    const url = new URL(imageUrl);

    const pathname = url.pathname;

    // Example:
    // /my-cloud/image/upload/v123456789/menupio/restaurants/main-images/abc123.jpg

    const uploadIndex = pathname.indexOf("/upload/");

    if (uploadIndex === -1) {
      return null;
    }

    let publicPath = pathname.substring(uploadIndex + "/upload/".length);

    // Remove transformation parameters if present
    // Example:
    // /c_fill,w_500/v123/menupio/...
    const parts = publicPath.split("/");

    // Remove version:
    // v123456789
    if (parts[0] && /^v\d+$/.test(parts[0])) {
      parts.shift();
    }

    publicPath = parts.join("/");

    // Remove file extension
    publicPath = publicPath.replace(/\.[^/.]+$/, "");

    return publicPath || null;
  } catch (error) {
    console.error("Failed to extract Cloudinary public ID:", error);

    return null;
  }
};

// ============================================================
// CREATE RESTAURANT
// ============================================================

exports.createRestaurant = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.create({
    ...req.body,
    owner: req.user._id,
  });

  console.log(restaurant);

  res.status(201).json(restaurant);
});

// ============================================================
// GET RESTAURANTS
// ============================================================

exports.getRestaurants = catchAsync(async (req, res) => {
  const restaurants = await Restaurant.find({
    owner: req.user._id,
  }).populate("owner");

  res.json(restaurants);
});

// ============================================================
// GET RESTAURANT
// ============================================================

exports.getRestaurant = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id);

  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: "Restaurant not found",
    });
  }

  res.json(restaurant);
});

// ============================================================
// UPDATE RESTAURANT INFORMATION
// ============================================================

exports.updateRestaurant = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id);

  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: "Restaurant not found",
    });
  }

  // ==========================================================
  // CHECK OWNERSHIP
  // ==========================================================

  if (
    !restaurant.owner ||
    restaurant.owner.toString() !== req.user._id.toString()
  ) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to update this restaurant",
    });
  }

  // ==========================================================
  // UPDATE ALLOWED FIELDS
  // ==========================================================

  const {
    name,
    description,
    email,
    address,
    location,
    phone,
    footerMessage,
    openingHours,
    facebook,
    instagram,
    whatsAppNumber,
  } = req.body;

  // ==========================================================
  // BASIC INFORMATION
  // ==========================================================

  if (name !== undefined) {
    if (!String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Restaurant name cannot be empty",
      });
    }

    restaurant.name = String(name).trim();
  }

  if (description !== undefined) {
    restaurant.description = description;
  }

  if (email !== undefined) {
    restaurant.email = email;
  }

  if (address !== undefined) {
    restaurant.address = address;
  }

  if (location !== undefined) {
    restaurant.location = location;
  }

  if (phone !== undefined) {
    restaurant.phone = phone;
  }

  // ==========================================================
  // FOOTER
  // ==========================================================

  if (footerMessage !== undefined) {
    restaurant.footerMessage = footerMessage;
  }

  // ==========================================================
  // SOCIAL
  // ==========================================================

  if (facebook !== undefined) {
    restaurant.facebook = facebook;
  }

  if (instagram !== undefined) {
    restaurant.instagram = instagram;
  }

  if (whatsAppNumber !== undefined) {
    restaurant.whatsAppNumber = whatsAppNumber;
  }

  // ==========================================================
  // OPENING HOURS
  // ==========================================================

  if (openingHours !== undefined) {
    try {
      restaurant.openingHours =
        typeof openingHours === "string"
          ? JSON.parse(openingHours)
          : openingHours;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid openingHours format",
      });
    }
  }

  // ==========================================================
  // IMAGE CHANGES ARE NOT HANDLED HERE
  // ==========================================================

  // Main image:
  //
  // PUT /api/restaurants/:id/mainImage
  //
  // Logo:
  //
  // PUT /api/restaurants/:id/logo

  // ==========================================================
  // SAVE
  // ==========================================================

  await restaurant.save();

  // ==========================================================
  // RESPONSE
  // ==========================================================

  return res.status(200).json({
    success: true,
    message: "Restaurant updated successfully",
    restaurant,
  });
});

// ============================================================
// DELETE RESTAURANT
// ============================================================

exports.deleteRestaurant = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id);

  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: "Restaurant not found",
    });
  }

  // ==========================================================
  // CHECK OWNERSHIP
  // ==========================================================

  if (
    !restaurant.owner ||
    restaurant.owner.toString() !== req.user._id.toString()
  ) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to delete this restaurant",
    });
  }

  await Restaurant.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: "Restaurant deleted successfully",
  });
});

// ============================================================
// UPDATE LOGO
// ============================================================

exports.updateLogo = catchAsync(async (req, res) => {
  const { id } = req.params;

  const restaurant = await Restaurant.findById(id);

  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: "Business not found",
    });
  }

  // ==========================================================
  // CHECK OWNERSHIP
  // ==========================================================

  if (
    !restaurant.owner ||
    restaurant.owner.toString() !== req.user._id.toString()
  ) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to update this restaurant",
    });
  }

  // ==========================================================
  // CHECK FILE
  // ==========================================================

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "Please upload an image",
    });
  }

  // ==========================================================
  // UPLOAD NEW LOGO
  // ==========================================================

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "logo",
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      },
    );

    uploadStream.end(req.file.buffer);
  });

  // ==========================================================
  // UPDATE DATABASE
  // ==========================================================

  restaurant.logo = result.secure_url;

  await restaurant.save();

  // ==========================================================
  // RESPONSE
  // ==========================================================

  res.json({
    success: true,
    message: "Logo updated successfully",
    logo: restaurant.logo,
    restaurant,
  });
});

// ============================================================
// UPDATE MAIN IMAGE
// ============================================================

exports.updateMainImage = catchAsync(async (req, res) => {
  let uploadedImagePublicId = null;

  try {
    // ========================================================
    // AUTH
    // ========================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // ========================================================
    // CHECK FILE
    // ========================================================

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Main image is required",
      });
    }

    if (!req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: "Uploaded image buffer is missing",
      });
    }

    // ========================================================
    // FIND RESTAURANT
    // ========================================================

    const restaurant = await Restaurant.findById(req.params.id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    // ========================================================
    // CHECK OWNERSHIP
    // ========================================================

    if (
      !restaurant.owner ||
      restaurant.owner.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update this restaurant",
      });
    }

    // ========================================================
    // SAVE OLD IMAGE URL
    // ========================================================

    const oldImageUrl = restaurant.mainImage;

    console.log("======================================");
    console.log("OLD MAIN IMAGE");
    console.log(oldImageUrl);
    console.log("======================================");

    // ========================================================
    // UPLOAD NEW IMAGE
    // ========================================================

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "menupio/restaurants/main-images",
          resource_type: "image",
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

    // ========================================================
    // SAVE NEW PUBLIC ID
    // ========================================================

    uploadedImagePublicId = result.public_id;

    console.log("======================================");
    console.log("NEW MAIN IMAGE");
    console.log("URL:", result.secure_url);
    console.log("PUBLIC ID:", result.public_id);
    console.log("======================================");

    // ========================================================
    // UPDATE DATABASE
    // ========================================================

    restaurant.mainImage = result.secure_url;

    await restaurant.save();

    // ========================================================
    // DELETE OLD CLOUDINARY IMAGE
    // ========================================================

    if (oldImageUrl) {
      try {
        const oldPublicId = extractCloudinaryPublicId(oldImageUrl);

        console.log("Old Cloudinary public ID:", oldPublicId);

        if (oldPublicId) {
          const deleteResult = await cloudinary.uploader.destroy(oldPublicId, {
            resource_type: "image",
          });

          console.log("Cloudinary old image delete result:", deleteResult);

          if (deleteResult.result === "ok") {
            console.log("Old main image deleted successfully");
          } else {
            console.log("Old main image was not deleted:", deleteResult);
          }
        } else {
          console.log("Could not extract old Cloudinary public ID");
        }
      } catch (error) {
        // Do NOT fail the entire update just because
        // old-image cleanup failed.
        console.error("Failed to delete old main image:", error);
      }
    }

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,
      message: "Main image updated successfully",
      image: restaurant.mainImage,
      restaurant,
    });
  } catch (error) {
    console.error("======================================");
    console.error("updateMainImage ERROR");
    console.error(error);
    console.error("======================================");

    // ========================================================
    // CLEANUP NEW IMAGE
    // ========================================================

    if (uploadedImagePublicId) {
      try {
        console.log("Cleaning up newly uploaded image:", uploadedImagePublicId);

        await cloudinary.uploader.destroy(uploadedImagePublicId, {
          resource_type: "image",
        });
      } catch (cleanupError) {
        console.error("Failed to cleanup uploaded image:", cleanupError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update main image",
      error: error.message,
    });
  }
});
