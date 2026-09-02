const MenuItem = require("../models/MenuItem");
const Category = require("../models/Category");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const Menu = require("../models/Menu");
const catchAsync = require("../utils/catchAsync");
/*
|--------------------------------------------------------------------------
| GET PRODUCTS + CATEGORIES
|--------------------------------------------------------------------------
*/
const getAllProducts = async (req, res) => {
  try {
    const [products, categories] = await Promise.all([
      MenuItem.find({})
        .populate("owner", "name")
        .sort({ createdAt: -1 })
        .lean(),

      Category.find({}).sort({ createdAt: -1 }).lean(),
    ]);

    return res.status(200).json({
      success: true,
      products,
      categories,

      counts: {
        products: products.length,
        categories: categories.length,
      },
    });
  } catch (error) {
    console.error("getAllProducts error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch products and categories",
    });
  }
};

/*
|--------------------------------------------------------------------------
| BULK PRODUCTS
|--------------------------------------------------------------------------
|
| Expected body:
|
| {
|   "products": [
|     {
|       "_id": "...",
|       "name": "...",
|       "description": "...",
|       "price": 10,
|       "category": "..."
|     }
|   ]
| }
|
*/

const bulkProducts = catchAsync(async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items)) {
    return res.status(400).json({
      success: false,
      message: "items must be an array",
    });
  }

  const created = [];
  const updated = [];

  for (const item of items) {
    const { id, _id, ...data } = item;

    // =====================================================
    // UPDATE
    // =====================================================

    if (id || _id) {
      const menuItemId = id || _id;

      const menuItem = await MenuItem.findById(menuItemId);

      if (!menuItem) {
        return res.status(404).json({
          success: false,
          message: `Menu item not found: ${menuItemId}`,
        });
      }

      Object.assign(menuItem, data);

      await menuItem.save();

      updated.push(menuItem);
    }

    // =====================================================
    // CREATE
    // =====================================================
    else {
      const menuItem = await MenuItem.create(data);

      created.push(menuItem);
    }
  }

  return res.status(200).json({
    success: true,
    message: "Menu items processed successfully",
    created,
    updated,
    createdCount: created.length,
    updatedCount: updated.length,
    items: [...created, ...updated],
  });
});
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select("-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error("getAllUsers error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
    });
  }
};

const getAllRestaurants = async (req, res) => {
  try {
    const restaurants = await Restaurant.find({})
      .populate("owner", "name")

      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: restaurants.length,
      restaurants,
    });
  } catch (error) {
    console.error("getAllRestaurants error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch restaurants",
    });
  }
};

const getAllMenus = async (req, res) => {
  try {
    const menus = await Menu.find({}).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      count: menus.length,
      menus,
    });
  } catch (error) {
    console.error("getAllMenus error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch menus",
    });
  }
};

/*
|--------------------------------------------------------------------------
| CLONE MENU
|--------------------------------------------------------------------------
*/
const bulkCategories = catchAsync(async (req, res) => {
  const { categories } = req.body;

  if (!Array.isArray(categories)) {
    return res.status(400).json({
      success: false,
      message: "categories must be an array",
    });
  }

  const results = [];

  for (const categoryData of categories) {
    const { id, ...data } = categoryData;

    // ============================================
    // UPDATE
    // ============================================

    if (id) {
      const category = await Category.findByIdAndUpdate(id, data, {
        new: true,
        runValidators: true,
      });

      if (!category) {
        return res.status(404).json({
          success: false,
          message: `Category not found: ${id}`,
        });
      }

      results.push({
        action: "updated",
        category,
      });

      continue;
    }

    // ============================================
    // CREATE
    // ============================================

    const category = await Category.create(data);

    results.push({
      action: "created",
      category,
    });
  }

  return res.status(200).json({
    success: true,
    message: "Categories processed successfully",
    results,
  });
});
const cloneMenu = (req, res) => {};
const updateMenu = (req, res) => {};
const deleteMenu = (req, res) => {};
const createRestaurant = (req, res) => {};
const createSingleProduct = (req, res) => {};

module.exports = {
  getAllRestaurants,
  getAllMenus,
  getAllProducts,
  bulkProducts,
  getAllUsers,
  cloneMenu,
  updateMenu,
  bulkCategories,
  deleteMenu,
  createRestaurant,
  createSingleProduct,
};
