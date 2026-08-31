const Menu = require("../models/Menu");
const Restaurant = require("../models/Restaurant");

const cloudinary = require("../utils/Claudinary");
const mongoose = require("mongoose");

// =====================================================
// CLOUDINARY UPLOAD HELPER
// =====================================================

const uploadBufferToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    if (!buffer) {
      return reject(new Error("Image buffer is missing"));
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "image",
        ...options,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve(result);
      },
    );

    uploadStream.end(buffer);
  });
};

// =====================================================
// CLOUDINARY PUBLIC ID HELPER
// =====================================================

const extractCloudinaryPublicId = (imageUrl) => {
  try {
    if (!imageUrl) {
      return null;
    }

    const url = new URL(imageUrl);

    const parts = url.pathname.split("/");

    const uploadIndex = parts.indexOf("upload");

    if (uploadIndex === -1) {
      return null;
    }

    // Everything after /upload/
    let pathParts = parts.slice(uploadIndex + 1);

    // Remove transformations
    //
    // Examples:
    // c_fill,w_500
    // c_fill
    // w_500
    // h_500
    //
    while (
      pathParts.length &&
      (pathParts[0].includes("_") ||
        pathParts[0].startsWith("c_") ||
        pathParts[0].startsWith("w_") ||
        pathParts[0].startsWith("h_"))
    ) {
      pathParts.shift();
    }

    // Remove Cloudinary version
    //
    // Example:
    // v123456789
    //
    if (pathParts[0]?.startsWith("v")) {
      pathParts.shift();
    }

    if (!pathParts.length) {
      return null;
    }

    const filename = pathParts.pop();

    const filenameWithoutExtension = filename.replace(/\.[^/.]+$/, "");

    pathParts.push(filenameWithoutExtension);

    return pathParts.join("/");
  } catch (error) {
    console.error("extractCloudinaryPublicId error:", error);

    return null;
  }
};

// =====================================================
// DELETE CLOUDINARY IMAGE
// =====================================================

const deleteCloudinaryImage = async (imageUrl) => {
  if (!imageUrl) {
    return;
  }

  try {
    const publicId = extractCloudinaryPublicId(imageUrl);

    if (!publicId) {
      return;
    }

    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Failed to delete Cloudinary image:", error);
  }
};

// =====================================================
// CREATE MENU
// =====================================================

// @desc    Create a menu
// @route   POST /api/menus
// @access  Private

const createMenu = async (req, res) => {
  let uploadedImage = null;

  try {
    // =====================================================
    // AUTHENTICATION
    // =====================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // =====================================================
    // BODY
    // =====================================================

    const { name, type, available, settings, items, categories, restaurantId } =
      req.body;

    // =====================================================
    // VALIDATE NAME
    // =====================================================

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Menu name is required",
      });
    }

    // =====================================================
    // VALIDATE RESTAURANT
    // =====================================================

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: "Restaurant is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid restaurant ID",
      });
    }

    // =====================================================
    // VERIFY RESTAURANT
    // =====================================================

    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    // =====================================================
    // CHECK RESTAURANT OWNERSHIP
    // =====================================================

    if (
      !restaurant.owner ||
      String(restaurant.owner) !== String(req.user._id)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to create a menu for this restaurant",
      });
    }

    // =====================================================
    // PARSE ITEMS / CATEGORIES / SETTINGS
    // =====================================================

    let parsedItems = [];
    let parsedCategories = [];
    let parsedSettings = {};

    try {
      parsedItems = typeof items === "string" ? JSON.parse(items) : items || [];

      parsedCategories =
        typeof categories === "string"
          ? JSON.parse(categories)
          : categories || [];

      parsedSettings =
        typeof settings === "string" ? JSON.parse(settings) : settings || {};
    } catch (error) {
      console.error("JSON parse error:", error);

      return res.status(400).json({
        success: false,
        message: "Invalid items, categories or settings format",
      });
    }

    // =====================================================
    // IMAGE
    // =====================================================

    let mainImage = null;

    // -----------------------------------------------------
    // STATIC MENU IMAGE
    // -----------------------------------------------------

    if (type === "static" && req.file) {
      if (!req.file.buffer) {
        return res.status(400).json({
          success: false,
          message: "Uploaded image buffer is missing",
        });
      }

      const result = await uploadBufferToCloudinary(req.file.buffer, {
        folder: "menupio/menus",
      });

      mainImage = result.secure_url;

      uploadedImage = result.public_id;
    }

    // -----------------------------------------------------
    // EMENTA FRAME IMAGE
    // -----------------------------------------------------

    if (type === "ementa" && req.file) {
      if (!req.file.buffer) {
        return res.status(400).json({
          success: false,
          message: "Uploaded image buffer is missing",
        });
      }

      const result = await uploadBufferToCloudinary(req.file.buffer, {
        folder: "menupio/frames",
      });

      parsedSettings = {
        ...parsedSettings,
        customFrameImage: result.secure_url,
      };

      uploadedImage = result.public_id;
    }

    // =====================================================
    // SLUG
    // =====================================================

    const slug = String(name)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // =====================================================
    // CREATE MENU
    // =====================================================

    const menu = await Menu.create({
      user: req.user._id,

      name: String(name).trim(),

      slug,

      ownId: 0,

      mainImage,

      type,

      available:
        available === undefined
          ? true
          : available === "true" || available === true,

      settings: parsedSettings,

      items: parsedItems,

      restaurant: restaurantId,

      categories: parsedCategories,
    });

    // =====================================================
    // POPULATE
    // =====================================================

    const populatedMenu = await Menu.findById(menu._id)
      .populate("items")
      .populate("categories")
      .populate("restaurant");

    // =====================================================
    // SUCCESS
    // =====================================================

    return res.status(201).json({
      success: true,
      message: "Menu created successfully",
      menu: populatedMenu,
    });
  } catch (error) {
    console.error("createMenu error:", error);

    // =====================================================
    // CLEANUP UPLOADED IMAGE
    // =====================================================

    if (uploadedImage) {
      try {
        await cloudinary.uploader.destroy(uploadedImage);
      } catch (cloudinaryError) {
        console.error("Failed to cleanup Cloudinary image:", cloudinaryError);
      }
    }

    // =====================================================
    // ERROR
    // =====================================================

    return res.status(500).json({
      success: false,
      message: "Failed to create menu",
      error: error.message,
    });
  }
};

// =====================================================
// GET MENUS
// =====================================================

// @desc    Get authenticated user's menus
// @route   GET /api/menus
// @access  Private

const getMenus = async (req, res) => {
  try {
    // =====================================================
    // AUTH
    // =====================================================

    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // =====================================================
    // FIND MENUS
    // =====================================================

    const menus = await Menu.find({
      user: req.user._id,
    })
      .populate("items")
      .populate("categories")
      .populate("restaurant")
      .sort({
        createdAt: -1,
      });

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,
      count: menus.length,
      menus,
    });
  } catch (error) {
    console.error("getMenus error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get menus",
      error: error.message,
    });
  }
};

// =====================================================
// GET SINGLE MENU
// =====================================================

// @desc    Get a menu
// @route   GET /api/menus/:id
// @access  Public / Private

const getMenu = async (req, res) => {
  try {
    const { id } = req.params;

    // =====================================================
    // VALIDATE ID
    // =====================================================

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Menu ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu ID",
      });
    }

    // =====================================================
    // FIND MENU
    // =====================================================

    const menu = await Menu.findById(id)
      .populate("items")
      .populate("categories")
      .populate("restaurant");

    // =====================================================
    // NOT FOUND
    // =====================================================

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu not found",
      });
    }

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,
      menu,
    });
  } catch (error) {
    console.error("getMenu error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get menu",
      error: error.message,
    });
  }
};

// =====================================================
// UPDATE MENU
// =====================================================

// @desc    Update a menu
// @route   PUT /api/menus/:id
// @access  Private

const updateMenu = async (req, res) => {
  let uploadedImage = null;

  try {
    // =====================================================
    // AUTHENTICATION
    // =====================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // =====================================================
    // VALIDATE MENU ID
    // =====================================================

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Menu ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu ID",
      });
    }

    // =====================================================
    // FIND MENU
    // =====================================================

    const menu = await Menu.findById(id);

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu not found",
      });
    }

    // =====================================================
    // FIND RESTAURANT
    // =====================================================

    const restaurant = await Restaurant.findById(menu.restaurant);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    // =====================================================
    // CHECK OWNERSHIP
    // =====================================================

    const userId = String(req.user._id);
    const ownerId = String(restaurant.owner);

    if (userId !== ownerId) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update this menu",
      });
    }

    // =====================================================
    // BODY
    // =====================================================

    const { name, available, items, categories, settings, type } = req.body;

    // =====================================================
    // NAME
    // =====================================================

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Menu name cannot be empty",
      });
    }

    if (name !== undefined) {
      menu.name = String(name).trim();

      // ---------------------------------------------------
      // UPDATE SLUG WHEN NAME CHANGES
      // ---------------------------------------------------

      menu.slug = String(name)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    // =====================================================
    // TYPE
    // =====================================================

    if (type !== undefined) {
      menu.type = type;
    }

    // =====================================================
    // AVAILABLE
    // =====================================================

    if (available !== undefined) {
      menu.available = available === "true" || available === true;
    }

    // =====================================================
    // ITEMS
    // =====================================================

    if (items !== undefined) {
      try {
        menu.items = typeof items === "string" ? JSON.parse(items) : items;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid items format",
        });
      }
    }

    // =====================================================
    // CATEGORIES
    // =====================================================

    if (categories !== undefined) {
      try {
        menu.categories =
          typeof categories === "string" ? JSON.parse(categories) : categories;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid categories format",
        });
      }
    }

    // =====================================================
    // SETTINGS
    // =====================================================

    if (settings !== undefined) {
      try {
        const parsedSettings =
          typeof settings === "string" ? JSON.parse(settings) : settings;

        menu.settings = {
          ...(menu.settings?.toObject
            ? menu.settings.toObject()
            : menu.settings || {}),
          ...(parsedSettings || {}),
        };
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid settings format",
        });
      }
    }

    // =====================================================
    // REPLACE MAIN IMAGE
    // =====================================================

    if (req.file) {
      // ---------------------------------------------------
      // CHECK BUFFER
      // ---------------------------------------------------

      if (!req.file.buffer) {
        return res.status(400).json({
          success: false,
          message: "Uploaded image buffer is missing",
        });
      }

      const oldImageUrl = menu.mainImage;

      // ---------------------------------------------------
      // UPLOAD NEW IMAGE
      // ---------------------------------------------------

      const result = await uploadBufferToCloudinary(req.file.buffer, {
        folder: "menupio/menus",
      });

      // ---------------------------------------------------
      // SAVE NEW IMAGE
      // ---------------------------------------------------

      menu.mainImage = result.secure_url;

      uploadedImage = result.public_id;

      // ---------------------------------------------------
      // DELETE OLD IMAGE
      // ---------------------------------------------------

      if (oldImageUrl && oldImageUrl !== result.secure_url) {
        await deleteCloudinaryImage(oldImageUrl);
      }
    }

    // =====================================================
    // SAVE
    // =====================================================

    await menu.save();

    // =====================================================
    // POPULATE
    // =====================================================

    const populatedMenu = await Menu.findById(menu._id)
      .populate("items")
      .populate("categories")
      .populate("restaurant");

    // =====================================================
    // SUCCESS
    // =====================================================

    return res.status(200).json({
      success: true,
      message: "Menu updated successfully",
      menu: populatedMenu,
    });
  } catch (error) {
    console.error("updateMenu error:", error);

    // =====================================================
    // CLEANUP NEW IMAGE
    // =====================================================

    if (uploadedImage) {
      try {
        await cloudinary.uploader.destroy(uploadedImage);
      } catch (cloudinaryError) {
        console.error("Failed to cleanup uploaded image:", cloudinaryError);
      }
    }

    // =====================================================
    // ERROR
    // =====================================================

    return res.status(500).json({
      success: false,
      message: "Failed to update menu",
      error: error.message,
    });
  }
};

// =====================================================
// DELETE MENU
// =====================================================

// @desc    Delete a menu
// @route   DELETE /api/menus/:id
// @access  Private

const deleteMenu = async (req, res) => {
  try {
    // =====================================================
    // AUTH
    // =====================================================

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "You are not authenticated",
      });
    }

    const userId = req.user._id;

    // =====================================================
    // VALIDATE ID
    // =====================================================

    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Menu ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu ID",
      });
    }

    // =====================================================
    // FIND MENU
    // =====================================================

    const menu = await Menu.findById(id);

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu not found",
      });
    }

    // =====================================================
    // FIND RESTAURANT
    // =====================================================

    const restaurant = await Restaurant.findById(menu.restaurant);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    // =====================================================
    // CHECK OWNERSHIP
    // =====================================================

    if (!restaurant.owner || String(restaurant.owner) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete this menu",
      });
    }

    // =====================================================
    // DELETE MAIN IMAGE
    // =====================================================

    if (menu.mainImage) {
      await deleteCloudinaryImage(menu.mainImage);
    }

    // =====================================================
    // DELETE MENU
    // =====================================================

    await Menu.deleteOne({
      _id: menu._id,
    });

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,
      message: "Menu deleted successfully",
      menuId: menu._id,
    });
  } catch (error) {
    console.error("deleteMenu error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete menu",
      error: error.message,
    });
  }
};

// =====================================================
// GET RESTAURANT MENUS
// =====================================================

// @desc    Get menus belonging to a restaurant
// @route   POST /api/menus/restaurant
// @access  Private

const getRestaurantMenus = async (req, res) => {
  try {
    const { restaurantId } = req.body;

    // =====================================================
    // VALIDATE RESTAURANT ID
    // =====================================================

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: "Restaurant ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid restaurant ID",
      });
    }

    // =====================================================
    // AUTH
    // =====================================================

    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // =====================================================
    // FIND MENUS
    // =====================================================

    const menus = await Menu.find({
      restaurant: restaurantId,
    })
      .populate("items")
      .populate("categories")
      .populate("restaurant")
      .sort({
        createdAt: -1,
      });

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.status(200).json({
      success: true,
      count: menus.length,
      menus,
    });
  } catch (error) {
    console.error("getRestaurantMenus error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get restaurant menus",
      error: error.message,
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  createMenu,
  getMenus,
  getMenu,
  updateMenu,
  deleteMenu,
  getRestaurantMenus,
};
