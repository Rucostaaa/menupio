const MenuItem = require("../models/MenuItem");
const Category = require("../models/Category");
const SiteItem = require("../models/SiteItem");
const SiteCategory = require("../models/SiteCategory");

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
const updateAdminUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Only admins can change user roles
    if (req.user?.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Apenas administradores podem alterar roles.",
      });
    }

    const allowedRoles = [
      "admin",
      "owner",
      "store",

      "employer",
      "advertisor",
      "customer",
      "user",
    ];

    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Role inválida.",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilizador não encontrado.",
      });
    }

    // An admin can NEVER change their own role
    if (String(user._id) === String(req.user._id)) {
      return res.status(403).json({
        success: false,
        message: "Não podes alterar a tua própria role.",
      });
    }

    user.role = role;

    await user.save();

    const updatedUser = await User.findById(user._id).select("-password");

    return res.status(200).json({
      success: true,
      message: "Role atualizada com sucesso.",
      user: updatedUser,
    });
  } catch (error) {
    console.error("UPDATE ADMIN USER ROLE ERROR:", error);

    return res.status(500).json({
      success: false,
      message:
        error?.message || "Não foi possível atualizar a role do utilizador.",
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

const bulkMenu = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id: restaurantId } = req.params;
    const { restaurant: restaurantData, menu: menuData, siteItems } = req.body;

    // ---------------------------------------------------------
    // 1. VALIDATION
    // ---------------------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid restaurant ID",
      });
    }

    if (!Array.isArray(siteItems) || siteItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "siteItems must be a non-empty array",
      });
    }

    // ---------------------------------------------------------
    // 2. FIND RESTAURANT
    // ---------------------------------------------------------

    const restaurant = await Restaurant.findById(restaurantId).session(session);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    // ---------------------------------------------------------
    // 3. FIND SITE ITEMS
    // ---------------------------------------------------------

    const items = await SiteItem.find({
      _id: { $in: siteItems },
    }).session(session);

    if (items.length !== siteItems.length) {
      const foundIds = new Set(items.map((item) => item._id.toString()));

      const missingItems = siteItems.filter(
        (id) => !foundIds.has(id.toString()),
      );

      return res.status(400).json({
        success: false,
        message: "Some SiteItems were not found",
        missingItems,
      });
    }

    // ---------------------------------------------------------
    // 4. GET UNIQUE SITE CATEGORY IDS FROM SITE ITEMS
    // ---------------------------------------------------------

    const siteCategoryIds = new Set();

    for (const item of items) {
      if (item.category) {
        siteCategoryIds.add(item.category.toString());
      }
    }

    // ---------------------------------------------------------
    // 5. FIND SITE CATEGORIES
    // ---------------------------------------------------------

    const siteCategories = await SiteCategory.find({
      _id: {
        $in: [...siteCategoryIds],
      },
    }).session(session);

    if (siteCategories.length !== siteCategoryIds.size) {
      return res.status(400).json({
        success: false,
        message: "Some SiteCategories referenced by SiteItems were not found",
      });
    }

    // ---------------------------------------------------------
    // 6. GET UNIQUE MAIN CATEGORIES FROM SITE CATEGORIES
    // ---------------------------------------------------------

    const siteMainCategoryIds = new Set();

    for (const category of siteCategories) {
      if (category.mainCategory) {
        siteMainCategoryIds.add(category.mainCategory.toString());
      }
    }

    // ---------------------------------------------------------
    // 7. UPDATE RESTAURANT
    // ---------------------------------------------------------

    if (restaurantData && typeof restaurantData === "object") {
      const restaurantFieldsToUpdate = {
        ...restaurantData,
      };

      // Fields that bulk menu MUST NOT modify
      delete restaurantFieldsToUpdate.fidelization;
      delete restaurantFieldsToUpdate.hasFidelization;
      delete restaurantFieldsToUpdate.employers;
      delete restaurantFieldsToUpdate.logo;
      delete restaurantFieldsToUpdate.menus;
      delete restaurantFieldsToUpdate.owner;
      delete restaurantFieldsToUpdate.stripe;
      delete restaurantFieldsToUpdate._id;

      Object.assign(restaurant, restaurantFieldsToUpdate);
    }

    // ---------------------------------------------------------
    // 8. PREPARE MENU
    // ---------------------------------------------------------

    const menuFields = {
      ...(menuData || {}),
    };

    // These are generated by this endpoint
    delete menuFields.restaurant;
    delete menuFields.items;
    delete menuFields.categories;
    delete menuFields.mainCategory;
    delete menuFields._id;

    const menu = new Menu({
      ...menuFields,

      restaurant: restaurant._id,

      // SiteItems only
      items: items.map((item) => ({
        item: item._id,
        itemModel: "SiteItem",
      })),

      // SiteCategories from SiteItems
      categories: [...siteCategoryIds],

      // MainCategories from SiteCategories
      mainCategory: [...siteMainCategoryIds],
    });

    // ---------------------------------------------------------
    // 9. SAVE MENU
    // ---------------------------------------------------------

    await menu.save({ session });

    // ---------------------------------------------------------
    // 10. ADD MENU TO RESTAURANT
    // ---------------------------------------------------------

    restaurant.menus.push(menu._id);

    await restaurant.save({ session });

    // ---------------------------------------------------------
    // 11. COMMIT
    // ---------------------------------------------------------

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: "Bulk menu created successfully",

      restaurant,
      menu,

      stats: {
        siteItems: items.length,
        siteCategories: siteCategoryIds.size,
        siteMainCategories: siteMainCategoryIds.size,
      },
    });
  } catch (error) {
    await session.abortTransaction();

    console.error("bulkMenu error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create bulk menu",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
};

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
  bulkMenu,
  updateMenu,
  bulkCategories,
  deleteMenu,
  createRestaurant,
  createSingleProduct,
  updateAdminUserRole,
};
