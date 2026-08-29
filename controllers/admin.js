const MenuItem = require("../models/MenuItem");
const Category = require("../models/Category");
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const Menu = require("../models/Menu");

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

const bulkProducts = async (req, res) => {
  try {
    const { products } = req.body;

    if (!Array.isArray(products)) {
      return res.status(400).json({
        success: false,
        message: "products must be an array",
      });
    }

    if (products.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No products provided",
      });
    }

    const operations = products
      .filter((product) => product?._id)
      .map((product) => ({
        updateOne: {
          filter: {
            _id: product._id,
          },

          update: {
            $set: {
              ...product,
            },
          },

          upsert: false,
        },
      }));

    if (operations.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid products provided",
      });
    }

    const result = await MenuItem.bulkWrite(operations);

    return res.status(200).json({
      success: true,

      message: "Products updated successfully",

      result: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedCount: result.upsertedCount,
      },
    });
  } catch (error) {
    console.error("bulkProducts error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update products",
    });
  }
};
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
  deleteMenu,
  createRestaurant,
  createSingleProduct,
};
