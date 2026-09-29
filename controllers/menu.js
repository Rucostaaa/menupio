const Menu = require("../models/Menu");
const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");
const SiteItem = require("../models/SiteItem");

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

const createSiteMenu = async (req, res) => {
  try {
    const {
      restaurant,
      name,
      slug,
      items,
      whatsAppButton = false,
      headerImage = null,
      hasAdverts = false,
      isAdvert = false,
      hasCustom = false,
      mainCategory = [],
      categories = [],
      available = true,
      type,
      style,
      settings = {},
    } = req.body;

    /*
     * ============================================================
     * VALIDATION
     * ============================================================
     */

    if (!restaurant) {
      return res.status(400).json({
        success: false,
        message: "Restaurant é obrigatório.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(restaurant)) {
      return res.status(400).json({
        success: false,
        message: "Restaurant inválido.",
      });
    }

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Nome do menu é obrigatório.",
      });
    }

    if (!slug?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Slug do menu é obrigatório.",
      });
    }

    /*
     * ============================================================
     * RESTAURANT
     * ============================================================
     */

    const restaurantDoc = await Restaurant.findById(restaurant);

    if (!restaurantDoc) {
      return res.status(404).json({
        success: false,
        message: "Restaurante não encontrado.",
      });
    }

    /*
     * ============================================================
     * ITEMS
     * ============================================================
     *
     * Frontend:
     *
     * items: [
     *   "SITE_ITEM_ID_1",
     *   "SITE_ITEM_ID_2"
     * ]
     *
     * Database:
     *
     * items: [
     *   {
     *     item: "...",
     *     itemModel: "SiteItems"
     *   }
     * ]
     */

    let itemIds = [];

    if (items) {
      if (Array.isArray(items)) {
        itemIds = items;
      } else {
        try {
          const parsed = JSON.parse(items);

          if (Array.isArray(parsed)) {
            itemIds = parsed;
          }
        } catch (error) {
          return res.status(400).json({
            success: false,
            message: "Formato de items inválido.",
          });
        }
      }
    }

    /*
     * Normalizar IDs
     */

    itemIds = itemIds
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item?._id) {
          return String(item._id);
        }

        if (item?.item) {
          return String(item.item);
        }

        return null;
      })
      .filter(Boolean);

    /*
     * Remover duplicados
     */

    itemIds = [...new Set(itemIds)];

    /*
     * Validar IDs
     */

    const invalidItemIds = itemIds.filter(
      (id) => !mongoose.Types.ObjectId.isValid(id),
    );

    if (invalidItemIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Um ou mais SiteItems são inválidos.",
        invalidItems: invalidItemIds,
      });
    }

    /*
     * ============================================================
     * VALIDATE SITE ITEMS
     * ============================================================
     */

    if (itemIds.length > 0) {
      const siteItems = await SiteItem.find({
        _id: {
          $in: itemIds,
        },
      })
        .select("_id")
        .lean();

      const foundIds = new Set(siteItems.map((item) => String(item._id)));

      const missingIds = itemIds.filter((id) => !foundIds.has(String(id)));

      if (missingIds.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Um ou mais SiteItems não foram encontrados.",
          missingItems: missingIds,
        });
      }
    }

    /*
     * ============================================================
     * MENU ITEMS
     * ============================================================
     */

    const menuItems = itemIds.map((itemId) => ({
      item: itemId,
      itemModel: "SiteItem",
    }));

    /*
     * ============================================================
     * ARRAYS
     * ============================================================
     */

    const normalizeArray = (value) => {
      if (!value) {
        return [];
      }

      if (Array.isArray(value)) {
        return value;
      }

      try {
        const parsed = JSON.parse(value);

        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    };

    const normalizedCategories = normalizeArray(categories)
      .map((category) => {
        if (typeof category === "string") {
          return category;
        }

        return category?._id || category?.id || null;
      })
      .filter(Boolean);

    const normalizedMainCategories = normalizeArray(mainCategory)
      .map((category) => {
        if (typeof category === "string") {
          return category;
        }

        return category?._id || category?.id || null;
      })
      .filter(Boolean);

    /*
     * ============================================================
     * CLOUDINARY - MAIN IMAGE
     * ============================================================
     *
     * req.file vem do:
     *
     * upload.single("mainImage")
     *
     * Aqui fazemos o upload para Cloudinary e guardamos
     * SOMENTE o secure_url no MongoDB.
     */

    let mainImage = null;

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "menupio/menus",
        resource_type: "image",
      });

      mainImage = result.secure_url;
    }

    /*
     * ============================================================
     * OWN ID
     * ============================================================
     */

    const lastMenu = await Menu.findOne({
      restaurant,
    })
      .sort({
        ownId: -1,
      })
      .select("ownId")
      .lean();

    const ownId = lastMenu?.ownId ? Number(lastMenu.ownId) + 1 : 1;

    /*
     * ============================================================
     * SLUG
     * ============================================================
     */

    const cleanSlug = String(slug)
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    /*
     * ============================================================
     * DUPLICATE SLUG
     * ============================================================
     */

    const existingMenu = await Menu.findOne({
      restaurant,
      slug: cleanSlug,
    });

    if (existingMenu) {
      return res.status(409).json({
        success: false,
        message: "Já existe um menu com este slug neste restaurante.",
      });
    }

    /*
     * ============================================================
     * CREATE MENU
     * ============================================================
     */

    const menu = await Menu.create({
      restaurant,

      name: name.trim(),

      slug: cleanSlug,

      ownId,

      whatsAppButton: whatsAppButton === true || whatsAppButton === "true",

      /*
       * Cloudinary HTTPS URL
       */
      mainImage,

      /*
       * Header continua a aceitar URL
       */
      headerImage: headerImage || null,

      hasAdverts: hasAdverts === true || hasAdverts === "true",

      isAdvert: isAdvert === true || isAdvert === "true",

      hasCustom: hasCustom === true || hasCustom === "true",

      /*
       * ONLY SITE ITEMS
       */
      items: menuItems,

      mainCategory: normalizedMainCategories,

      categories: normalizedCategories,

      available: available !== false && available !== "false",

      type: type || "restaurant",

      style: style || "modern",

      settings,
    });

    /*
     * ============================================================
     * POPULATE RESPONSE
     * ============================================================
     */

    const populatedMenu = await Menu.findById(menu._id)
      .populate("restaurant")
      .populate({
        path: "items.item",
        model: "SiteItem",
      })
      .lean();

    /*
     * ============================================================
     * SUCCESS
     * ============================================================
     */

    return res.status(201).json({
      success: true,
      message: "Menu criado com sucesso.",
      menu: populatedMenu,
    });
  } catch (error) {
    console.error("CREATE SITE MENU ERROR:", error);

    /*
     * Mongo duplicate
     */

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Já existe um menu com estes dados.",
        error: error.keyValue,
      });
    }

    /*
     * Mongoose validation
     */

    if (error?.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Dados do menu inválidos.",
        errors: Object.values(error.errors).map((err) => err.message),
      });
    }

    return res.status(500).json({
      success: false,
      message: "Erro ao criar o menu.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
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
      .populate("mainCategory")
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
const getAllMenus = async (req, res) => {
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

    const menus = await Menu.find({})
      .populate("items")
      .populate("categories")
      .populate("mainCategory")
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
      .populate("hasAdverts")
      .populate({
        path: "mainCategory",
        populate: {
          path: "categories",
        },
      })
      .populate("restaurant");
    console.log(menu);
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
const getInitialData = async (req, res) => {
  console.log("");
  console.log("==============================================");
  console.log("🔥 MENU INITIAL-DATA ROUTE HIT");
  console.log("==============================================");
  console.log("METHOD:", req.method);
  console.log("ORIGINAL URL:", req.originalUrl);
  console.log("BASE URL:", req.baseUrl);
  console.log("PATH:", req.path);
  console.log("PARAMS:", req.params);
  console.log("QUERY:", req.query);
  console.log("==============================================");
  console.log("");
  try {
    const { id } = req.params;

    console.log("req.params:", req.params);
    console.log("req.query:", req.query);

    // =========================================================
    // PAGINATION
    // =========================================================

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);

    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 8, 1),
      50,
    );

    // =========================================================
    // VALIDATE SLUG
    // =========================================================

    if (!id || typeof id !== "string" || !id.trim()) {
      return res.status(400).json({
        success: false,
        message: "Menu slug is required",
      });
    }

    const slug = id.trim();

    console.log("LOOKING UP MENU BY SLUG:", slug);

    // =========================================================
    // GET MENU BY SLUG
    // =========================================================

    const menu = await Menu.findOne({
      slug,
    })
      .select(
        "name slug items categories mainCategory restaurant hasAdverts categorySystem",
      )

      // =======================================================
      // RESTAURANT
      // =======================================================

      .populate({
        path: "restaurant",
        model: "Restaurant",
      })

      // =======================================================
      // MENU ITEMS
      // =======================================================

      .populate({
        path: "items.item",
        model: "SiteItem",

        populate: [
          // -----------------------------------------------
          // DIRECT SITE ITEM CATEGORY
          // -----------------------------------------------

          {
            path: "category",
            model: "SiteCategory",

            populate: {
              path: "siteMainCategory",
              model: "SiteMainCategory",
            },
          },

          // -----------------------------------------------
          // IMAGE DOCUMENTS
          // -----------------------------------------------

          {
            path: "images",
            model: "Image",
          },

          // -----------------------------------------------
          // RESTAURANT PLACEMENTS
          // -----------------------------------------------

          {
            path: "placements.category",
            model: "SiteCategory",

            populate: {
              path: "siteMainCategory",
              model: "SiteMainCategory",
            },
          },
        ],
      })

      // =======================================================
      // MENU CATEGORIES
      // =======================================================

      .populate({
        path: "categories",
        model: "SiteCategory",

        populate: {
          path: "siteMainCategory",
          model: "SiteMainCategory",
        },
      })

      // =======================================================
      // MENU MAIN CATEGORIES
      // =======================================================

      .populate({
        path: "mainCategory",
        model: "SiteMainCategory",
      })

      .lean();

    // =========================================================
    // MENU NOT FOUND
    // =========================================================

    if (!menu) {
      console.log("MENU NOT FOUND BY SLUG:", slug);

      return res.status(404).json({
        success: false,
        message: "Menu not found",
        slug,
      });
    }

    console.log("MENU FOUND:", {
      id: String(menu._id),
      slug: menu.slug,
      name: menu.name,
      categorySystem: menu.categorySystem,
    });

    // =========================================================
    // NORMALIZE IDS
    // =========================================================

    const normalizeId = (value) => {
      if (!value) {
        return null;
      }

      if (typeof value === "string" || typeof value === "number") {
        return String(value);
      }

      if (value._id) {
        return String(value._id);
      }

      if (value.id) {
        return String(value.id);
      }

      return null;
    };

    // =========================================================
    // MENU CONFIG
    // =========================================================

    const restaurantId = normalizeId(menu.restaurant);

    const categorySystem = menu.categorySystem || null;

    const isSingleCategorySystem = categorySystem === "single";

    console.log("MENU CATEGORY SYSTEM:", categorySystem);

    console.log("IS SINGLE CATEGORY SYSTEM:", isSingleCategorySystem);

    // =========================================================
    // CATEGORY QUERY
    // =========================================================

    let requestedCategories = [];

    const rawCategories = req.query.categories;

    if (Array.isArray(rawCategories)) {
      requestedCategories = rawCategories.flatMap((value) => {
        if (typeof value !== "string") {
          return [value];
        }

        return value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      });
    } else if (typeof rawCategories === "string") {
      const trimmed = rawCategories.trim();

      // -----------------------------------------------
      // JSON ARRAY
      // -----------------------------------------------

      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);

          if (Array.isArray(parsed)) {
            requestedCategories = parsed;
          }
        } catch {
          requestedCategories = trimmed
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }
      }

      // -----------------------------------------------
      // COMMA SEPARATED
      // -----------------------------------------------
      else {
        requestedCategories = trimmed
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }

    // =========================================================
    // FALLBACK CATEGORY ID
    // =========================================================

    if (requestedCategories.length === 0 && req.query.categoryId) {
      requestedCategories = Array.isArray(req.query.categoryId)
        ? req.query.categoryId
        : [req.query.categoryId];
    }

    console.log("requestedCategories:", requestedCategories);

    // =========================================================
    // NORMALIZE / VALIDATE CATEGORY IDS
    // =========================================================

    const validCategoryIds = requestedCategories
      .map((value) => String(value).trim())
      .filter((value) => mongoose.Types.ObjectId.isValid(value));

    const categoryFilterWasRequested = requestedCategories.length > 0;

    const categorySet = new Set(validCategoryIds);

    console.log("validCategoryIds:", validCategoryIds);

    console.log("categorySet:", [...categorySet]);

    // =========================================================
    // MENU ITEMS
    // =========================================================

    const menuItems = (menu.items || [])
      .filter(
        (menuItem) =>
          menuItem && menuItem.item && menuItem.itemModel === "SiteItem",
      )
      .map((menuItem) => menuItem.item)
      .filter((item) => item && item._id);

    console.log("MENU ITEMS COUNT:", menuItems.length);

    console.log(
      "MENU ITEMS:",
      menuItems.map((item) => ({
        id: String(item._id),

        name: item?.name?.pt || item?.name?.en || "",

        category: normalizeId(item.category),

        placements: Array.isArray(item.placements)
          ? item.placements.map((placement) => ({
              restaurant: normalizeId(placement?.restaurant),

              category: normalizeId(placement?.category),
            }))
          : [],
      })),
    );

    // =========================================================
    // SEARCH
    // =========================================================

    const search = String(req.query.search || "")
      .trim()
      .toLowerCase();

    console.log("SEARCH:", search || "(none)");

    // =========================================================
    // FILTER ITEMS
    // =========================================================

    let filteredItems = menuItems.filter((item) => {
      console.log("CHECKING ITEM:", String(item._id));

      // =====================================================
      // SEARCH
      // =====================================================

      if (search) {
        const searchableValues = [
          item?.name?.pt,
          item?.name?.["pt-PT"],
          item?.name?.en,
          item?.name?.["en-US"],
          item?.name?.es,

          item?.description?.pt,
          item?.description?.["pt-PT"],
          item?.description?.en,
          item?.description?.["en-US"],
          item?.description?.es,
        ]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());

        const matchesSearch = searchableValues.some((value) =>
          value.includes(search),
        );

        console.log("matchesSearch:", matchesSearch);

        if (!matchesSearch) {
          return false;
        }
      }

      // =====================================================
      // NO CATEGORY FILTER
      // =====================================================

      if (!categoryFilterWasRequested) {
        console.log("NO CATEGORY FILTER -> KEEP ITEM");

        return true;
      }

      // =====================================================
      // CATEGORY FILTER REQUESTED
      // BUT NO VALID IDS
      // =====================================================

      if (categorySet.size === 0) {
        console.log("CATEGORY FILTER REQUESTED BUT NO VALID IDS");

        return false;
      }

      // =====================================================
      // SINGLE CATEGORY SYSTEM
      //
      // SiteItem:
      //
      // category: SiteCategory
      // =====================================================

      if (isSingleCategorySystem) {
        const itemCategoryId = normalizeId(item.category);

        const matchesDirectCategory = Boolean(
          itemCategoryId && categorySet.has(itemCategoryId),
        );

        console.log("SINGLE CATEGORY CHECK:", {
          itemId: String(item._id),

          itemCategoryId,

          requestedCategories: [...categorySet],

          matchesDirectCategory,
        });

        return matchesDirectCategory;
      }

      // =====================================================
      // NORMAL CATEGORY SYSTEM
      //
      // SiteItem:
      //
      // placements[].category
      // =====================================================

      const placements = Array.isArray(item.placements) ? item.placements : [];

      const matchesPlacement = placements.some((placement) => {
        if (!placement) {
          return false;
        }

        const placementRestaurant = normalizeId(placement.restaurant);

        const placementCategory = normalizeId(placement.category);

        // ---------------------------------------------
        // RESTAURANT MUST MATCH
        // ---------------------------------------------

        if (restaurantId && placementRestaurant !== restaurantId) {
          return false;
        }

        // ---------------------------------------------
        // CATEGORY MUST MATCH
        // ---------------------------------------------

        return categorySet.has(placementCategory);
      });

      console.log("NORMAL CATEGORY CHECK:", {
        itemId: String(item._id),

        restaurantId,

        placements: placements.map((placement) => ({
          restaurant: normalizeId(placement?.restaurant),

          category: normalizeId(placement?.category),
        })),

        matchesPlacement,
      });

      return matchesPlacement;
    });

    // =========================================================
    // PRESERVE MENU ORDER
    // =========================================================

    const originalOrder = new Map();

    menuItems.forEach((item, index) => {
      originalOrder.set(String(item._id), index);
    });

    filteredItems.sort((a, b) => {
      return (
        (originalOrder.get(String(a._id)) ?? 999999) -
        (originalOrder.get(String(b._id)) ?? 999999)
      );
    });

    // =========================================================
    // PAGINATION
    // =========================================================

    const totalItems = filteredItems.length;

    const start = (page - 1) * limit;

    const end = start + limit;

    const items = filteredItems.slice(start, end);

    // =========================================================
    // RESULT DEBUG
    // =========================================================

    console.log("================ RESULT DEBUG ================");

    console.log("Menu ID:", String(menu._id));

    console.log("Menu slug:", menu.slug);

    console.log("Category system:", categorySystem);

    console.log("Total menu items:", menuItems.length);

    console.log("Total matching items:", totalItems);

    console.log("Returning items:", items.length);

    console.log(
      "Returned item names:",
      items.map((item) => item?.name?.pt || item?.name?.en || String(item._id)),
    );

    console.log("==============================================");

    // =========================================================
    // RESPONSE
    // =========================================================

    return res.status(200).json({
      success: true,

      menu: {
        ...menu,

        items,

        pagination: {
          page,
          limit,
          total: totalItems,

          hasMore: page * limit < totalItems,

          totalPages: Math.ceil(totalItems / limit),
        },
      },
    });
  } catch (error) {
    console.error("getInitialData error:", error);

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
    const mainCategories = settings.mainCategories;
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
    // MAIN CATEGORIES
    // =====================================================
    //
    // Expected:
    //
    // mainCategories: [
    //   "65...",
    //   "66...",
    //   "67..."
    // ]
    //
    // Only IDs are stored.
    //

    if (mainCategories !== undefined) {
      try {
        const parsedMainCategories =
          typeof mainCategories === "string"
            ? JSON.parse(mainCategories)
            : mainCategories;

        if (!Array.isArray(parsedMainCategories)) {
          return res.status(400).json({
            success: false,
            message: "Main categories must be an array",
          });
        }

        const invalidMainCategory = parsedMainCategories.find(
          (mainCategoryId) => !mongoose.Types.ObjectId.isValid(mainCategoryId),
        );

        if (invalidMainCategory) {
          return res.status(400).json({
            success: false,
            message: "Invalid main category ID",
          });
        }
        const mainCategoryIds = parsedMainCategories.map(
          (mainCategory) => mainCategory.id,
        );

        menu.mainCategory = mainCategoryIds;
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid mainCategories format",
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
      .populate("mainCategory")
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
  getInitialData,
  createSiteMenu,
  getAllMenus,
};
