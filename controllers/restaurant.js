const Restaurant = require("../models/Restaurant");
const User = require("../models/User");
const Menu = require("../models/Menu");
const cloudinary = require("../utils/Claudinary");
const catchAsync = require("../utils/catchAsync");
const { log } = require("node:console");
const languages = [
  { title: "pt", language: "Português" },
  { title: "en", language: "English" },
  { title: "es", language: "Español" },
  { title: "fr", language: "Français" },
  { title: "de", language: "Deutsch" },
  { title: "it", language: "Italiano" },
  { title: "nl", language: "Nederlands" },
]; // ============================================================
// CLOUDINARY HELPERS
// ============================================================

const extractCloudinaryPublicId = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== "string") {
    return null;
  }

  try {
    const url = new URL(imageUrl);
    const pathname = url.pathname;

    const uploadIndex = pathname.indexOf("/upload/");

    if (uploadIndex === -1) {
      return null;
    }

    let publicPath = pathname.substring(uploadIndex + "/upload/".length);

    const parts = publicPath.split("/");

    // Remove Cloudinary version.
    if (parts[0] && /^v\d+$/.test(parts[0])) {
      parts.shift();
    }

    publicPath = parts.join("/");

    // Remove file extension.
    publicPath = publicPath.replace(/\.[^/.]+$/, "");

    return publicPath || null;
  } catch (error) {
    console.error("Failed to extract Cloudinary public ID:", error);

    return null;
  }
};

// ============================================================
// RESTAURANT POPULATION
// ============================================================
//
// IMPORTANT:
// Restaurant does NOT have a `menu` field.
//
// Therefore we only populate fields that actually exist on
// the Restaurant schema.
//
// Menu is loaded separately where needed using:
// Menu.findOne({ restaurant: restaurant._id })
//
// Password is explicitly excluded.
// ============================================================

const restaurantPopulation = [
  {
    path: "owner",
    model: "User",
    select:
      "_id name username firstName lastName email role avatar avatarUrl profileImage schedule",
  },
  {
    path: "employers",
    model: "User",
    select:
      "_id name username firstName lastName email role avatar avatarUrl profileImage schedule",
  },
];

// ============================================================
// CREATE RESTAURANT
// ============================================================

exports.createRestaurant = catchAsync(async (req, res) => {
  if (req?.body?.fidelization?.menuItem === "") {
    req.body.fidelization.menuItem = null;
  }

  const restaurant = await Restaurant.create({
    ...req.body,
    owner: req.user._id,
  });

  const populatedRestaurant = await Restaurant.findById(restaurant._id)
    .populate(restaurantPopulation[0])
    .populate(restaurantPopulation[1]);

  return res.status(201).json({
    success: true,
    restaurant: populatedRestaurant,
  });
});

// ============================================================
// GET RESTAURANTS
// ============================================================
exports.getAllRestaurants = catchAsync(async (req, res) => {
  const restaurants = await Restaurant.find({})
    .populate(restaurantPopulation[0])
    .populate(restaurantPopulation[1]);

  return res.status(200).json({
    success: true,
    restaurants,
  });
});
exports.getRestaurants = catchAsync(async (req, res) => {
  const restaurants = await Restaurant.find({
    owner: req.user._id,
  })
    .populate(restaurantPopulation[0])
    .populate(restaurantPopulation[1]);

  return res.status(200).json({
    success: true,
    restaurants,
  });
});

// ============================================================
// GET RESTAURANT
// ============================================================

exports.getRestaurant = catchAsync(async (req, res) => {
  const restaurant = await Restaurant.findById(req.params.id)
    .populate(restaurantPopulation[0])
    .populate(restaurantPopulation[1]);

  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: "Restaurant not found",
    });
  }

  return res.status(200).json({
    success: true,
    restaurant,
  });
});

// ============================================================
// GET EMPLOYER RESTAURANT
// ============================================================
//
// Finds the restaurant linked to the employer.
//
// Returns:
// - restaurant
// - populated owner
// - populated employers
// - employer schedules
// - menu belonging to this restaurant
//
// Menu is fetched separately because Restaurant does NOT have
// a `menu` field.
//
// Menu.restaurant -> Restaurant
// ============================================================

exports.getEmployerRestaurant = catchAsync(async (req, res) => {
  const { id } = req.params;

  const user = await User.findById(id).select(
    "_id name username firstName lastName email role avatar avatarUrl profileImage schedule",
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  if (user.role !== "employer" && user.role !== "advertisor") {
    return res.status(403).json({
      success: false,
      message: "This user is not an employer or advertisor",
    });
  }

  // ----------------------------------------------------------
  // FIND RESTAURANT
  // ----------------------------------------------------------

  const restaurant = await Restaurant.findOne({
    employers: user._id,
  })
    .populate(restaurantPopulation[0])
    .populate(restaurantPopulation[1]);

  if (!restaurant) {
    return res.status(404).json({
      success: false,
      message: "Restaurant not found for this employer",
    });
  }

  // ----------------------------------------------------------
  // FIND MENU
  // ----------------------------------------------------------
  //
  // Menu has:
  //
  // restaurant: ObjectId -> Restaurant
  //
  // So we find the menu directly using the restaurant ID.
  //
  // We explicitly exclude `restaurant`, just like excluding
  // password from User.
  // ----------------------------------------------------------

  const menu = await Menu.findOne({
    restaurant: restaurant._id,
  })
    .select("-restaurant")
    .populate({
      path: "items",
      model: "MenuItem",
    })
    .populate({
      path: "mainCategory",
      model: "MainCategory",
    })
    .populate({
      path: "categories",
      model: "Category",
    });

  // ----------------------------------------------------------
  // RESPONSE
  // ----------------------------------------------------------

  return res.status(200).json({
    success: true,
    restaurant,
    menu,
  });
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
    hasFidelization,
    fidelization,
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

  if (hasFidelization !== undefined) {
    restaurant.hasFidelization =
      hasFidelization === true || hasFidelization === "true";
  }

  if (fidelization !== undefined) {
    const menuItemId = fidelization?.menuItem || null;
    const maxStamps = Number(fidelization?.maxStamps);

    if (
      restaurant.hasFidelization &&
      (!menuItemId ||
        !Number.isInteger(maxStamps) ||
        maxStamps < 1 ||
        maxStamps > 100)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Fidelization requires a menu item and maxStamps between 1 and 100.",
      });
    }

    if (menuItemId) {
      const MenuItem = require("../models/MenuItem");
      const menuItem = await MenuItem.findOne({
        _id: menuItemId,
        restaurant: restaurant._id,
      });

      if (!menuItem) {
        return res.status(400).json({
          success: false,
          message: "The loyalty menu item must belong to this restaurant.",
        });
      }
    }

    restaurant.fidelization = {
      menuItem: menuItemId,
      maxStamps: Number.isInteger(maxStamps) ? maxStamps : 10,
    };
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
  // SAVE
  // ==========================================================

  await restaurant.save();

  // ==========================================================
  // RETURN POPULATED RESTAURANT
  // ==========================================================

  const populatedRestaurant = await Restaurant.findById(restaurant._id)
    .populate(restaurantPopulation[0])
    .populate(restaurantPopulation[1]);

  return res.status(200).json({
    success: true,
    message: "Restaurant updated successfully",
    restaurant: populatedRestaurant,
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

  // ==========================================================
  // DELETE
  // ==========================================================

  await Restaurant.findByIdAndDelete(req.params.id);

  return res.status(200).json({
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
  // RETURN POPULATED RESTAURANT
  // ==========================================================

  const populatedRestaurant = await Restaurant.findById(restaurant._id)
    .populate(restaurantPopulation[0])
    .populate(restaurantPopulation[1]);

  return res.json({
    success: true,
    message: "Logo updated successfully",
    logo: restaurant.logo,
    restaurant: populatedRestaurant,
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

        if (oldPublicId) {
          const deleteResult = await cloudinary.uploader.destroy(oldPublicId, {
            resource_type: "image",
          });

          if (deleteResult.result !== "ok") {
            console.warn("Cloudinary old image was not deleted:", deleteResult);
          }
        }
      } catch (error) {
        // Do NOT fail the entire update because the old image
        // cleanup failed.
        console.error("Failed to delete old main image:", error);
      }
    }

    // ========================================================
    // RETURN POPULATED RESTAURANT
    // ========================================================

    const populatedRestaurant = await Restaurant.findById(restaurant._id)
      .populate(restaurantPopulation[0])
      .populate(restaurantPopulation[1]);

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,
      message: "Main image updated successfully",
      image: restaurant.mainImage,
      restaurant: populatedRestaurant,
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

exports.updateRestaurantLanguage = async (req, res) => {
  try {
    const { id } = req.params;
    const { language } = req.body;

    if (!Array.isArray(language)) {
      return res.status(400).json({
        success: false,
        message: "language must be an array.",
      });
    }

    const availableLanguages = languages.map((item) => item.title);

    const invalidLanguages = language.filter(
      (item) => !availableLanguages.includes(item),
    );

    if (invalidLanguages.length > 0) {
      return res.status(400).json({
        success: false,
        message: "One or more languages are invalid.",
        invalidLanguages,
      });
    }

    const uniqueLanguages = [...new Set(language)];

    const restaurant = await Restaurant.findById(id);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found.",
      });
    }

    const userId = String(req.user?._id);

    const isOwner = String(restaurant.owner) === userId;

    const isEmployer = restaurant.employers?.some(
      (employer) => String(employer) === userId,
    );

    if (!isOwner && !isEmployer) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this restaurant.",
      });
    }

    restaurant.language = uniqueLanguages;

    await restaurant.save();

    return res.status(200).json({
      success: true,
      message: "Restaurant languages updated successfully.",
      restaurant,
      language: restaurant.language,
    });
  } catch (error) {
    console.error("Update restaurant language error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update restaurant languages.",
    });
  }
};
