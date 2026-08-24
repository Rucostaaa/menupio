const fs = require("fs");
const Menu = require("../models/Menu");
const Restaurant = require("../models/Restaurant");

const cloudinary = require("../utils/Claudinary");
const { default: mongoose } = require("mongoose");

// =====================================================
// CREATE MENU
// =====================================================

// @desc    Create a menu
// @route   POST /api/menus
// @access  Private
const createMenu = async (req, res) => {
  let uploadedImage = null;

  try {
    const { name, type, available, settings, items, categories, restaurantId } =
      req.body;

    // Validate name
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Menu name is required",
      });
    }

    // Validate restaurant
    if (!req.user) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with a restaurant",
      });
    }

    // =====================================================
    // UPLOAD IMAGE
    // =====================================================

    let mainImage = null;

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "menupio/menus",
      });

      mainImage = result.secure_url;

      // Keep public_id so we can delete the image later
      uploadedImage = result.public_id;

      // Remove temporary local file
      fs.unlink(req.file.path, (error) => {
        if (error) {
          console.error("Failed to remove local file:", error);
        }
      });
    }

    // =====================================================
    // PARSE ITEMS / CATEGORIES
    // =====================================================

    let parsedItems = [];
    let parsedCategories = [];

    try {
      parsedItems = typeof items === "string" ? JSON.parse(items) : items || [];

      parsedCategories =
        typeof categories === "string"
          ? JSON.parse(categories)
          : categories || [];
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid items or categories format",
      });
    }

    // =====================================================
    // CREATE
    // =====================================================
    const slug = name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const menu = await Menu.create({
      user: req.user._id,

      name: name.trim(),
      slug: slug,
      ownId: 0,
      mainImage,
      type: type,
      available:
        available === undefined
          ? true
          : available === "true" || available === true,
      settings: settings,
      items: parsedItems,
      restaurant: restaurantId,
      categories: parsedCategories,
    });

    // =====================================================
    // POPULATE
    // =====================================================

    const populatedMenu = await Menu.findById(menu._id)
      .populate("items")
      .populate("categories");

    return res.status(201).json({
      success: true,
      message: "Menu created successfully",
      menu: populatedMenu,
    });
  } catch (error) {
    console.error("createMenu error:", error);

    // If MongoDB creation failed after Cloudinary
    // upload, remove the orphaned Cloudinary image.
    if (uploadedImage) {
      try {
        await cloudinary.uploader.destroy(uploadedImage);
      } catch (cloudinaryError) {
        console.error("Failed to cleanup Cloudinary image:", cloudinaryError);
      }
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create menu",
      error: error.message,
    });
  }
};
const getMenus = async (req, res) => {
  try {
    // Make sure we have an authenticated restaurant
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const menus = await Menu.find({
      user: req.user._id,
    })
      .populate("items")
      .populate("categories")
      .populate("restaurant")
      .sort({
        createdAt: -1,
      });

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
// UPDATE MENU
// =====================================================

// @desc    Update a menu
// @route   PUT /api/menus/:id
// @access  Private
const updateMenu = async (req, res) => {
  let uploadedImage = null;

  try {
    if (!req.user) {
      return res.status(400).json({
        success: false,
        message: "User is not associated with a restaurant",
      });
    }

    // =====================================================
    // FIND MENU
    // =====================================================

    const menu = await Menu.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu not found",
      });
    }

    // =====================================================
    // BASIC FIELDS
    // =====================================================

    const { name, available, items, categories } = req.body;

    if (name !== undefined && !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Menu name cannot be empty",
      });
    }

    if (name !== undefined) {
      menu.name = name.trim();
    }

    if (available !== undefined) {
      menu.available = available === "true" || available === true;
    }

    // =====================================================
    // ITEMS
    // =====================================================

    if (items !== undefined) {
      try {
        menu.items = typeof items === "string" ? JSON.parse(items) : items;
      } catch {
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
      } catch {
        return res.status(400).json({
          success: false,
          message: "Invalid categories format",
        });
      }
    }

    // =====================================================
    // REPLACE MAIN IMAGE
    // =====================================================

    if (req.file) {
      const oldImageUrl = menu.mainImage;

      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "menupio/menus",
      });

      menu.mainImage = result.secure_url;

      uploadedImage = result.public_id;

      // Remove local file
      fs.unlink(req.file.path, (error) => {
        if (error) {
          console.error("Failed to remove local file:", error);
        }
      });

      // Try to remove old Cloudinary image
      if (oldImageUrl) {
        try {
          const publicId = extractCloudinaryPublicId(oldImageUrl);

          if (publicId) {
            await cloudinary.uploader.destroy(publicId);
          }
        } catch (error) {
          console.error("Failed to remove old Cloudinary image:", error);
        }
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
      .populate("categories");

    return res.status(200).json({
      success: true,
      message: "Menu updated successfully",
      menu: populatedMenu,
    });
  } catch (error) {
    console.error("updateMenu error:", error);

    // Cleanup newly uploaded image
    // if update failed.
    if (uploadedImage) {
      try {
        await cloudinary.uploader.destroy(uploadedImage);
      } catch (cloudinaryError) {
        console.error("Failed to cleanup uploaded image:", cloudinaryError);
      }
    }

    // Cleanup local file if it still exists
    if (req.file?.path) {
      fs.unlink(req.file.path, () => {});
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update menu",
      error: error.message,
    });
  }
};
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

    const userId = req.user.id;

    // =====================================================
    // FIND MENU
    // =====================================================

    const menu = await Menu.findById(req.params.id);

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
    console.log(restaurant, userId);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    // =====================================================
    // CHECK OWNERSHIP
    // =====================================================

    if (
      !restaurant.owner ||
      restaurant.owner.toString() !== userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to delete this menu",
      });
    }

    // =====================================================
    // DELETE CLOUDINARY IMAGE
    // =====================================================

    if (menu.mainImage) {
      try {
        const publicId = extractCloudinaryPublicId(menu.mainImage);

        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
        }
      } catch (error) {
        console.error("Failed to delete Cloudinary image:", error);

        // We don't stop the menu deletion if Cloudinary fails.
      }
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
// CLOUDINARY PUBLIC ID HELPER
// =====================================================

const extractCloudinaryPublicId = (imageUrl) => {
  try {
    const url = new URL(imageUrl);

    const parts = url.pathname.split("/");

    const uploadIndex = parts.indexOf("upload");

    if (uploadIndex === -1) {
      return null;
    }

    // Everything after /upload/
    let pathParts = parts.slice(uploadIndex + 1);

    // Remove transformations
    // e.g. /c_fill,w_500/...
    while (
      pathParts.length &&
      (pathParts[0].includes("_") ||
        pathParts[0].startsWith("c_") ||
        pathParts[0].startsWith("w_") ||
        pathParts[0].startsWith("h_"))
    ) {
      pathParts.shift();
    }

    // Remove version
    // e.g. v123456789
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

const getRestaurantMenus = async (req, res) => {
  try {
    const { restaurantId } = req.body;

    console.log("BODY:", req.body);
    console.log("restaurantId:", restaurantId);
    console.log("type:", typeof restaurantId);

    // Validate restaurantId exists
    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        message: "Restaurant ID is required",
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid restaurant ID",
      });
    }

    // Optional authentication check
    if (!req.user?._id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const menus = await Menu.find({
      restaurant: restaurantId,
    })
      .populate("items")
      .populate("categories")
      .populate("restaurant")
      .sort({
        createdAt: -1,
      });

    console.log("MENUS:", menus);

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
const getMenu = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Menu ID is required",
      });
    }

    const menu = await Menu.findById(id)
      .populate("items")
      .populate("categories")
      .populate("restaurant");

    if (!menu) {
      return res.status(404).json({
        success: false,
        message: "Menu not found",
      });
    }

    return res.status(200).json({
      success: true,
      menu,
    });
  } catch (error) {
    console.error("Get menu error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get menu",
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
