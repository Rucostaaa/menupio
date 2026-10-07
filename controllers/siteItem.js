const mongoose = require("mongoose");
const catchAsync = require("./../utils/catchAsync");
const SiteItem = require("../models/SiteItem");
const Restaurant = require("../models/Restaurant");
const Category = require("../models/Category");
const SiteCategory = require("../models/SiteCategory");
const Menu = require("../models/Menu");
const cloudinary = require("../utils/Claudinary");

// ============================================================
// ADMIN CHECKs
// ============================================================

const requireAdmin = (req, res) => {
  if (req.user?.role !== "Admin") {
    res.status(403).json({
      success: false,
      message: "Apenas administradores podem gerir SiteItems.",
    });

    return false;
  }

  return true;
};

const validateRecommendationIds = async (value, itemId = null) => {
  if (!Array.isArray(value)) {
    return { error: "As recomendações devem ser uma lista de SiteItems." };
  }

  const ids = [...new Set(value.map((id) => String(id)))];
  if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return { error: "A lista contém um ID de recomendação inválido." };
  }
  if (itemId && ids.includes(String(itemId))) {
    return { error: "Um SiteItem não pode recomendar-se a si próprio." };
  }
  if (ids.length > 0) {
    const existingCount = await SiteItem.countDocuments({
      _id: { $in: ids },
    });
    if (existingCount !== ids.length) {
      return { error: "Uma ou mais recomendações não foram encontradas." };
    }
  }

  return { ids };
};

// ============================================================
// POPULATION
// ============================================================

const siteItemPopulation = [
  {
    path: "placements.restaurant",
    select: "_id name",
  },
  {
    path: "placements.category",
    model: "SiteCategory",
    select: "_id name",
  },
];

const DEFAULT_PLACEMENT_IMAGE_SETTINGS = {
  h: "105%",
  w: "105%",
  translateX: "14%",
  translateY: "2%",
};

const toPlainValue = (value, fallback) => {
  if (value && typeof value.toObject === "function") {
    return value.toObject();
  }

  return value ?? fallback;
};

const hasPlacementValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (value instanceof Map) return value.size > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
};

const createRestaurantPlacement = (
  siteItem,
  restaurantId,
  categoryId = null,
) => {
  const imageSettings = toPlainValue(
    siteItem.imageSettings,
    DEFAULT_PLACEMENT_IMAGE_SETTINGS,
  );

  return {
    restaurant: restaurantId,
    category: categoryId,
    name: toPlainValue(siteItem.name, {}),
    description: toPlainValue(siteItem.description, {}),
    ingredients: Array.isArray(siteItem.ingredients)
      ? [...siteItem.ingredients]
      : [],
    alerts: Array.isArray(siteItem.alerts) ? [...siteItem.alerts] : [],
    models: [],
    imageSettings: {
      h: imageSettings.h || DEFAULT_PLACEMENT_IMAGE_SETTINGS.h,
      w: imageSettings.w || DEFAULT_PLACEMENT_IMAGE_SETTINGS.w,
      translateX:
        imageSettings.translateX || DEFAULT_PLACEMENT_IMAGE_SETTINGS.translateX,
      translateY:
        imageSettings.translateY || DEFAULT_PLACEMENT_IMAGE_SETTINGS.translateY,
    },
  };
};

const completeRestaurantPlacement = (
  placement,
  siteItem,
  restaurantId,
  categoryId,
) => {
  const defaults = createRestaurantPlacement(
    siteItem,
    restaurantId,
    categoryId,
  );
  const currentName = toPlainValue(placement.name, {});
  const currentDescription = toPlainValue(placement.description, {});
  const currentImageSettings = toPlainValue(placement.imageSettings, {});
  const mergeLocalizedValues = (current, fallback) =>
    Object.fromEntries(
      [...new Set([...Object.keys(fallback), ...Object.keys(current)])].map(
        (language) => [
          language,
          hasPlacementValue(current[language])
            ? current[language]
            : fallback[language] || "",
        ],
      ),
    );

  placement.category = categoryId;
  placement.name = mergeLocalizedValues(currentName, defaults.name);
  placement.description = mergeLocalizedValues(
    currentDescription,
    defaults.description,
  );

  if (!hasPlacementValue(placement.ingredients)) {
    placement.ingredients = defaults.ingredients;
  }
  if (!hasPlacementValue(placement.alerts)) {
    placement.alerts = defaults.alerts;
  }

  placement.imageSettings = Object.fromEntries(
    Object.entries(DEFAULT_PLACEMENT_IMAGE_SETTINGS).map(([key, value]) => [
      key,
      hasPlacementValue(currentImageSettings[key])
        ? currentImageSettings[key]
        : value,
    ]),
  );
};

const canManageRestaurant = async (user, restaurantId) => {
  const normalizedRestaurantId = restaurantId?._id || restaurantId;

  if (!mongoose.Types.ObjectId.isValid(normalizedRestaurantId)) {
    return false;
  }

  if (String(user?.role || "").toLowerCase() === "admin") {
    return true;
  }

  return Boolean(
    await Restaurant.exists({
      _id: normalizedRestaurantId,
      $or: [{ owner: user?._id }, { employers: user?._id }],
    }),
  );
};

const categoryIsPlacedAtRestaurant = async (categoryId, restaurantId) => {
  if (!categoryId) return true;
  if (!mongoose.Types.ObjectId.isValid(categoryId)) return false;

  return Boolean(
    await SiteCategory.exists({
      _id: categoryId,
      "placements.restaurant": restaurantId?._id || restaurantId,
    }),
  );
};

const getReferenceId = (value) => {
  if (value === null || value === undefined) return "";

  const id =
    typeof value === "object" ? value?._id || value?.id || value : value;

  return String(id || "");
};

exports.createSiteItem = async (req, res) => {
  try {
    const item = req.body;
    const placements = Array.isArray(item?.placements) ? item.placements : [];

    if (!item || typeof item !== "object" || placements.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "A SiteItem and at least one restaurant placement are required.",
      });
    }

    for (const placement of placements) {
      if (!(await canManageRestaurant(req.user, placement?.restaurant))) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to manage this restaurant.",
        });
      }
      if (
        !(await categoryIsPlacedAtRestaurant(
          placement?.category,
          placement?.restaurant,
        ))
      ) {
        return res.status(400).json({
          success: false,
          message: "The selected category is not assigned to this restaurant.",
        });
      }
    }

    if (item.category && !(await SiteCategory.exists({ _id: item.category }))) {
      return res.status(400).json({
        success: false,
        message: "The selected category does not exist.",
      });
    }

    const siteItem = await SiteItem.create({
      name: item.name || {},
      description: item.description || {},
      category: item.category || null,
      image: Array.isArray(item.image) ? item.image : [],
      imageSettings: item.imageSettings || {},
      ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
      alerts: Array.isArray(item.alerts) ? item.alerts : [],
      placements,
    });

    const populated = await SiteItem.findById(siteItem._id)
      .populate(siteItemPopulation[0])
      .populate(siteItemPopulation[1]);

    return res.status(201).json({
      success: true,
      siteItem: populated,
    });
  } catch (error) {
    console.error("CREATE SITE ITEM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Unable to create SiteItem.",
    });
  }
};

{
  /* ============================================================
// CREATE SITE ITEM

exports.createSiteItemsBulk = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) {
      return;
    }

    const items = req.body;

    // ==========================================================
    // VALIDATE JSON BODY
    // ==========================================================

    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "O body deve ser um array de SiteItems.",
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "O array de SiteItems não pode estar vazio.",
      });
    }

    // ==========================================================
    // PREPARE ITEMS
    // ==========================================================

    const documents = items.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error(`Item na posição ${index} é inválido.`);
      }

      return {
        name: item.name && typeof item.name === "object" ? item.name : {},

        description:
          item.description && typeof item.description === "object"
            ? item.description
            : {},

        ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],

        alerts: Array.isArray(item.alerts) ? item.alerts : [],

        allergens: Array.isArray(item.allergens) ? item.allergens : [],

        // Sempre começa sem fotos.
        image: [],

        // Sempre começa sem placements.
        placements: [],
      };
    });

    // ==========================================================
    // CREATE ALL
    // ==========================================================

    const siteItems = await SiteItem.insertMany(documents);

    // ==========================================================
    // RESPONSE
    // ==========================================================

    return res.status(201).json({
      success: true,
      message: `${siteItems.length} SiteItems criados com sucesso.`,
      count: siteItems.length,
      siteItems,
    });
  } catch (error) {
    console.error("CREATE SITE ITEMS BULK ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Não foi possível criar os SiteItems.",
    });
  }
};

 =  */
}
exports.getOwnerSiteItems = async (req, res) => {
  const { id } = req.params;

  try {
    if (!(await canManageRestaurant(req.user, id))) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to view this restaurant's SiteItems.",
      });
    }

    const siteItems = await SiteItem.find({
      "placements.restaurant": id,
    })
      .populate({
        path: "category",
        model: "SiteCategory",
      })
      .populate(siteItemPopulation[0])
      .populate(siteItemPopulation[1])
      .sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: siteItems.length,
      siteItems,
    });
  } catch (error) {
    console.error("GET SITE ITEMS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Não foi possível obter os SiteItems.",
    });
  }
};

exports.getSiteItems = async (req, res) => {
  console.log(req.user);
  try {
    if (!requireAdmin(req, res)) {
      return;
    }

    const siteItems = await SiteItem.find()
      .populate({ path: "category", model: "SiteCategory" })

      .sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: siteItems.length,
      siteItems,
    });
  } catch (error) {
    console.error("GET SITE ITEMS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Não foi possível obter os SiteItems.",
    });
  }
};

// ============================================================
// GET ONE SITE ITEM
// ============================================================

exports.getSiteItem = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) {
      return;
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de SiteItem inválido.",
      });
    }

    const siteItem = await SiteItem.findById(id)
      .populate(siteItemPopulation[0])
      .populate(siteItemPopulation[1]);

    if (!siteItem) {
      return res.status(404).json({
        success: false,
        message: "SiteItem não encontrado.",
      });
    }

    return res.status(200).json({
      success: true,
      siteItem,
    });
  } catch (error) {
    console.error("GET SITE ITEM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Não foi possível obter o SiteItem.",
    });
  }
};

// ============================================================
// UPDATE SITE ITEM
// ============================================================

exports.updateSiteItem = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de SiteItem inválido.",
      });
    }

    const siteItem = await SiteItem.findById(id);

    if (!siteItem) {
      return res.status(404).json({
        success: false,
        message: "SiteItem não encontrado.",
      });
    }

    const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
    let recommendations;
    if (req.body.recommendations !== undefined) {
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Apenas administradores podem gerir recomendações.",
        });
      }

      const validation = await validateRecommendationIds(
        req.body.recommendations,
        siteItem._id,
      );
      if (validation.error) {
        return res.status(400).json({
          success: false,
          message: validation.error,
        });
      }
      recommendations = validation.ids;
    }

    const requestedPlacements = Array.isArray(req.body.placements)
      ? req.body.placements
      : siteItem.placements;

    console.log("========== UPDATE SITE ITEM ==========");
    console.log("SiteItem:", String(siteItem._id));
    console.log("User:", String(req.user?._id || req.user?.id));
    console.log("Role:", req.user?.role);
    console.log("Is admin:", isAdmin);
    console.log("Requested placements:", requestedPlacements);

    const managedPlacements = [];

    for (const placement of requestedPlacements) {
      const restaurantId = placement?.restaurant?._id || placement?.restaurant;

      const categoryId = placement?.category?._id || placement?.category;

      console.log("Checking placement:", {
        restaurantId,
        categoryId,
        placementId: placement?._id,
      });

      if (!restaurantId) {
        return res.status(400).json({
          success: false,
          message: "A placement is missing a restaurant.",
          placement,
        });
      }

      /*
       * Admins can manage all placements.
       */
      if (isAdmin) {
        managedPlacements.push(placement);
        continue;
      }

      /*
       * Non-admin users can only manage restaurants
       * they are allowed to manage.
       */
      const canManage = await canManageRestaurant(req.user, restaurantId);

      console.log("canManageRestaurant:", {
        restaurantId,
        canManage,
      });

      if (!canManage) {
        continue;
      }

      const existingPlacement = siteItem.placements.find((currentPlacement) => {
        if (
          placement?._id &&
          String(currentPlacement?._id) === String(placement._id)
        ) {
          return true;
        }

        return (
          getReferenceId(currentPlacement?.restaurant) ===
          getReferenceId(restaurantId)
        );
      });
      const existingCategoryId = getReferenceId(existingPlacement?.category);
      const requestedCategoryId = getReferenceId(categoryId);
      const categoryIsUnchanged =
        Boolean(existingPlacement) &&
        existingCategoryId === requestedCategoryId;

      console.log("Placement category comparison:", {
        placementId: placement?._id,
        existingCategoryId,
        requestedCategoryId,
        categoryIsUnchanged,
      });

      /*
       * Validate new category assignments, but allow unchanged legacy
       * assignments to keep being edited when the restaurant's category
       * configuration has since changed.
       */
      if (categoryId && !categoryIsUnchanged) {
        const categoryIsValid = await categoryIsPlacedAtRestaurant(
          categoryId,
          restaurantId,
        );

        console.log("categoryIsPlacedAtRestaurant:", {
          categoryId,
          restaurantId,
          categoryIsValid,
        });

        if (!categoryIsValid) {
          return res.status(400).json({
            success: false,
            message: "The selected category is not assigned to this restaurant.",
            restaurantId,
            categoryId,
            placementId: placement?._id,
          });
        }
      }

      managedPlacements.push(placement);
    }

    /*
     * A non-admin must have at least one placement
     * they are actually allowed to modify.
     */
    if (!isAdmin && managedPlacements.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update this SiteItem.",
      });
    }

    /*
     * Fields allowed on the root SiteItem.
     *
     * Price is NOT included because price only exists
     * inside a placement.
     */
    const allowedFields = [
      "name",
      "category",
      "description",
      "image",
      "imageSettings",
      "ingredients",
      "alerts",
      "placements",
      "recommendations",
    ];

    const editableFields = isAdmin ? allowedFields : ["placements"];

    editableFields.forEach((field) => {
      if (req.body[field] === undefined) {
        return;
      }
      if (field === "recommendations") {
        siteItem.recommendations = recommendations;
        return;
      }

      /*
       * Admins can directly update all allowed fields.
       */
      if (field !== "placements" || isAdmin) {
        siteItem[field] = req.body[field];
        return;
      }

      /*
       * Non-admin:
       * only replace placements belonging to restaurants
       * they are allowed to manage.
       */
      const managedRestaurantIds = new Set(
        managedPlacements.map((placement) =>
          String(placement?.restaurant?._id || placement?.restaurant),
        ),
      );

      const existingPlacements = Array.isArray(siteItem.placements)
        ? siteItem.placements
        : [];

      siteItem.placements = [
        ...existingPlacements.filter(
          (placement) =>
            !managedRestaurantIds.has(
              String(placement?.restaurant?._id || placement?.restaurant),
            ),
        ),
        ...managedPlacements,
      ];
    });

    console.log("Placements before save:", siteItem.placements);

    await siteItem.save();

    const updatedSiteItem = await SiteItem.findById(siteItem._id)
      .populate(siteItemPopulation[0])
      .populate(siteItemPopulation[1]);

    return res.status(200).json({
      success: true,
      message: "SiteItem atualizado com sucesso.",
      siteItem: updatedSiteItem,
    });
  } catch (error) {
    console.error("UPDATE SITE ITEM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Não foi possível atualizar o SiteItem.",
    });
  }
};

// ============================================================
// DELETE SITE ITEM
// ============================================================

exports.deleteSiteItem = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) {
      return;
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de SiteItem inválido.",
      });
    }

    const siteItem = await SiteItem.findById(id);

    if (!siteItem) {
      return res.status(404).json({
        success: false,
        message: "SiteItem não encontrado.",
      });
    }

    await siteItem.deleteOne();

    return res.status(200).json({
      success: true,
      message: "SiteItem eliminado com sucesso.",
    });
  } catch (error) {
    console.error("DELETE SITE ITEM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Não foi possível eliminar o SiteItem.",
    });
  }
};

// ============================================================
// PLACE SITE ITEM
// ============================================================

exports.placeSiteItem = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) {
      return;
    }

    const { id } = req.params;
    const { restaurantId, categoryId } = req.body;
    // ----------------------------------------------------------
    // VALIDATE SITE ITEM ID
    // ----------------------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de SiteItem inválido.",
      });
    }

    // ----------------------------------------------------------
    // VALIDATE RESTAURANT ID
    // ----------------------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        success: false,
        message: "ID de restaurante inválido.",
      });
    }

    // ----------------------------------------------------------
    // VALIDATE CATEGORY ID
    // ----------------------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "ID de categoria inválido.",
      });
    }

    // ----------------------------------------------------------
    // FIND SITE ITEM
    // ----------------------------------------------------------

    const siteItem = await SiteItem.findById(id);

    if (!siteItem) {
      return res.status(404).json({
        success: false,
        message: "SiteItem não encontrado.",
      });
    }
    console.log("CATEGORY VALIDATION", {
      restaurantId,
      categoryId: placement?.category?._id || placement?.category,
    });

    const categoryValid = await categoryIsPlacedAtRestaurant(
      placement?.category?._id || placement?.category,
      restaurantId,
    );

    console.log("CATEGORY VALID:", categoryValid);

    if (!categoryValid) {
      return res.status(400).json({
        success: false,
        message: "The selected category is not assigned to this restaurant.",
        restaurantId,
        categoryId: placement?.category?._id || placement?.category,
      });
    }
    // ----------------------------------------------------------
    // FIND RESTAURANT
    // ----------------------------------------------------------

    const restaurant = await Restaurant.findById(restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurante não encontrado.",
      });
    }

    // ----------------------------------------------------------
    // FIND CATEGORY
    // ----------------------------------------------------------

    const category = await SiteCategory.findById(categoryId);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Categoria não encontrada.",
      });
    }

    // ----------------------------------------------------------
    // CHECK IF ALREADY PLACED
    // ----------------------------------------------------------

    const alreadyPlaced = siteItem.placements.some(
      (placement) =>
        String(placement.restaurant) === String(restaurantId) &&
        String(placement.category) === String(categoryId),
    );

    if (alreadyPlaced) {
      return res.status(409).json({
        success: false,
        message:
          "Este SiteItem já está colocado neste restaurante e categoria.",
      });
    }

    // ----------------------------------------------------------
    // ADD PLACEMENT
    // ----------------------------------------------------------

    const incompletePlacement = siteItem.placements.find(
      (placement) =>
        String(placement.restaurant) === String(restaurantId) &&
        !placement.category,
    );

    if (incompletePlacement) {
      completeRestaurantPlacement(
        incompletePlacement,
        siteItem,
        restaurantId,
        categoryId,
      );
    } else {
      siteItem.placements.push(
        createRestaurantPlacement(siteItem, restaurantId, categoryId),
      );
    }

    await siteItem.save();

    // ----------------------------------------------------------
    // RETURN UPDATED SITE ITEM
    // ----------------------------------------------------------

    const updatedSiteItem = await SiteItem.findById(siteItem._id)
      .populate(siteItemPopulation[0])
      .populate(siteItemPopulation[1]);

    return res.status(200).json({
      success: true,
      message: "SiteItem colocado com sucesso.",
      siteItem: updatedSiteItem,
    });
  } catch (error) {
    console.error("PLACE SITE ITEM ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Não foi possível colocar o SiteItem.",
    });
  }
};

// ============================================================
// REMOVE SITE ITEM PLACEMENT
// ============================================================

exports.removeSiteItemPlacement = async (req, res) => {
  try {
    const { id, restaurantId, categoryId } = req.params;

    // ----------------------------------------------------------
    // VALIDATE IDS
    // ----------------------------------------------------------

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID de SiteItem inválido.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        success: false,
        message: "ID de restaurante inválido.",
      });
    }

    if (categoryId && !mongoose.Types.ObjectId.isValid(categoryId)) {
      return res.status(400).json({
        success: false,
        message: "ID de categoria inválido.",
      });
    }

    if (!(await canManageRestaurant(req.user, restaurantId))) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to remove this placement.",
      });
    }

    // ----------------------------------------------------------
    // FIND SITE ITEM
    // ----------------------------------------------------------

    const siteItem = await SiteItem.findById(id);

    if (!siteItem) {
      return res.status(404).json({
        success: false,
        message: "SiteItem não encontrado.",
      });
    }

    // ----------------------------------------------------------
    // FIND PLACEMENT
    // ----------------------------------------------------------

    const placementExists = siteItem.placements.some(
      (placement) =>
        String(placement.restaurant) === String(restaurantId) &&
        (!categoryId || String(placement.category) === String(categoryId)),
    );

    if (!placementExists) {
      return res.status(404).json({
        success: false,
        message:
          "Este SiteItem não está colocado nesse restaurante e categoria.",
      });
    }

    // ----------------------------------------------------------
    // REMOVE PLACEMENT
    // ----------------------------------------------------------

    siteItem.placements = siteItem.placements.filter(
      (placement) =>
        !(
          String(placement.restaurant) === String(restaurantId) &&
          (!categoryId || String(placement.category) === String(categoryId))
        ),
    );

    await siteItem.save();

    const updatedSiteItem = await SiteItem.findById(siteItem._id)
      .populate(siteItemPopulation[0])
      .populate(siteItemPopulation[1]);

    return res.status(200).json({
      success: true,
      message: "Placement removido com sucesso.",
      siteItem: updatedSiteItem,
    });
  } catch (error) {
    console.error("REMOVE SITE ITEM PLACEMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Não foi possível remover o placement.",
    });
  }
};
exports.updateManySiteItems = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) {
      return;
    }

    const items = req.body;

    // ==========================================================
    // VALIDATE BODY
    // ==========================================================

    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "O body deve ser um array de SiteItems.",
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "O array de SiteItems não pode estar vazio.",
      });
    }

    // ==========================================================
    // SPLIT UPDATE / CREATE
    // ==========================================================

    const itemsToUpdate = [];
    const itemsToCreate = [];
    for (let index = 0; index < items.length; index++) {
      const item = items[index];

      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return res.status(400).json({
          success: false,
          message: `Item na posição ${index} é inválido.`,
        });
      }

      if (item._id) {
        if (!mongoose.Types.ObjectId.isValid(item._id)) {
          return res.status(400).json({
            success: false,
            message: `O _id do item na posição ${index} é inválido.`,
          });
        }

        itemsToUpdate.push(item);
      } else {
        itemsToCreate.push(item);
      }
    }

    for (const item of [...itemsToCreate, ...itemsToUpdate]) {
      if (item.recommendations === undefined) {
        continue;
      }

      const validation = await validateRecommendationIds(
        item.recommendations,
        item._id || null,
      );
      if (validation.error) {
        return res.status(400).json({
          success: false,
          message: validation.error,
        });
      }
      item.recommendations = validation.ids;
    }

    // ==========================================================
    // CREATED
    // ==========================================================

    const createdItems = [];
    for (const item of itemsToCreate) {
      createdItems.push({
        name: item.name && typeof item.name === "object" ? item.name : {},
        description:
          item.description && typeof item.description === "object"
            ? item.description
            : {},
        image: Array.isArray(item.image) ? item.image : [],
        ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
        alerts: Array.isArray(item.alerts) ? item.alerts : [],
        allergens: Array.isArray(item.allergens) ? item.allergens : [],
        recommendations: item.recommendations || [],
        // New items always start with no placements.
        placements: [],
      });
    }

    // ==========================================================
    // CREATE NEW ITEMS
    // ==========================================================

    let created = [];

    if (createdItems.length > 0) {
      created = await SiteItem.insertMany(createdItems);
    }

    // ==========================================================
    // UPDATE EXISTING ITEMS
    // ==========================================================

    const updated = [];

    for (const item of itemsToUpdate) {
      const siteItem = await SiteItem.findById(item._id);

      if (!siteItem) {
        return res.status(404).json({
          success: false,
          message: `SiteItem ${item._id} não encontrado.`,
        });
      }

      // --------------------------------------------------------
      // ONLY UPDATE SITE ITEM DATA
      // --------------------------------------------------------
      //
      // placements are intentionally NOT updated here.
      //
      // Use /:id/place for restaurant/category
      // assignments.
      // --------------------------------------------------------

      if (item.name !== undefined) {
        siteItem.name =
          item.name && typeof item.name === "object" ? item.name : {};
      }

      if (item.description !== undefined) {
        siteItem.description =
          item.description && typeof item.description === "object"
            ? item.description
            : {};
      }

      if (item.image !== undefined) {
        siteItem.image = Array.isArray(item.image) ? item.image : [];
      }

      if (item.alerts !== undefined) {
        siteItem.alerts = Array.isArray(item.alerts) ? item.alerts : [];
      }

      if (item.allergens !== undefined) {
        siteItem.allergens = Array.isArray(item.allergens)
          ? item.allergens
          : [];
      }
      if (item.ingredients !== undefined) {
        siteItem.ingredients = Array.isArray(item.ingredients)
          ? item.ingredients
          : [];
      }
      if (item.recommendations !== undefined) {
        siteItem.recommendations = item.recommendations;
      }

      await siteItem.save();

      updated.push(siteItem);
    }

    // ==========================================================
    // RESPONSE
    // ==========================================================

    return res.status(200).json({
      success: true,

      message:
        `${created.length} SiteItems criados e ` +
        `${updated.length} SiteItems atualizados.`,

      count: {
        received: items.length,
        created: created.length,
        updated: updated.length,
      },

      created,
      updated,
    });
  } catch (error) {
    console.error("UPDATE MANY SITE ITEMS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error?.message || "Não foi possível atualizar os SiteItems.",
    });
  }
};
exports.updateAssignmentsSiteItems = catchAsync(async (req, res) => {
  const { restaurantId } = req.params;
  console.log("restaurantId", restaurantId);
  const { siteItemIds } = req.body;

  /*
    |--------------------------------------------------------------------------
    | VALIDATE RESTAURANT ID
    |--------------------------------------------------------------------------
    */

  if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
    return res.status(400).json({
      message: "Invalid restaurantId.",
    });
  }

  /*
    |--------------------------------------------------------------------------
    | VALIDATE SITE ITEM IDS
    |--------------------------------------------------------------------------
    */

  if (!Array.isArray(siteItemIds) || siteItemIds.length === 0) {
    return res.status(400).json({
      message: "siteItemIds is required and must be a non-empty array.",
    });
  }

  const invalidSiteItemIds = siteItemIds.filter(
    (id) => !mongoose.Types.ObjectId.isValid(id),
  );

  if (invalidSiteItemIds.length > 0) {
    return res.status(400).json({
      message: "One or more SiteItem IDs are invalid.",
      invalidSiteItemIds,
    });
  }

  /*
    |--------------------------------------------------------------------------
    | REMOVE DUPLICATE IDS
    |--------------------------------------------------------------------------
    */

  const uniqueSiteItemIds = [...new Set(siteItemIds.map((id) => String(id)))];

  /*
    |--------------------------------------------------------------------------
    | FIND SITE ITEMS
    |--------------------------------------------------------------------------
    */
  const siteItems = await SiteItem.find({
    _id: {
      $in: uniqueSiteItemIds,
    },
  });

  const foundIds = new Set(siteItems.map((item) => String(item._id)));

  const missingSiteItemIds = uniqueSiteItemIds.filter(
    (id) => !foundIds.has(String(id)),
  );

  console.log("REQUESTED IDS:", uniqueSiteItemIds);
  console.log("FOUND IDS:", [...foundIds]);
  console.log("MISSING IDS:", missingSiteItemIds);
  console.log("REQUESTED COUNT:", uniqueSiteItemIds.length);
  console.log("FOUND COUNT:", foundIds.size);
  console.log("MISSING COUNT:", missingSiteItemIds.length);

  if (missingSiteItemIds.length > 0) {
    return res.status(404).json({
      message: "One or more SiteItems were not found.",
      missingSiteItemIds,
    });
  }

  /*
    |--------------------------------------------------------------------------
    | UPDATE PLACEMENTS
    |--------------------------------------------------------------------------
    */

  const assigned = [];
  const alreadyAssigned = [];

  for (const siteItem of siteItems) {
    const placements = Array.isArray(siteItem.placements)
      ? siteItem.placements
      : [];

    const alreadyExists = placements.some(
      (placement) => String(placement?.restaurant) === String(restaurantId),
    );

    if (alreadyExists) {
      alreadyAssigned.push(siteItem);

      continue;
    }

    siteItem.placements.push(createRestaurantPlacement(siteItem, restaurantId));

    await siteItem.save();

    assigned.push(siteItem);
  }

  /*
    |--------------------------------------------------------------------------
    | SYNC MENU — push newly assigned items into the restaurant's menu
    |--------------------------------------------------------------------------
    */

  if (assigned.length > 0) {
    const restaurant = await Restaurant.findById(restaurantId).select("menus");

    if (restaurant?.menus?.length > 0) {
      const menuEntry = assigned.map((si) => ({
        item: si._id,
        itemModel: "SiteItem",
      }));

      // Push into every menu that belongs to this restaurant
      // (most restaurants have one menu, but handles multiple)
      await Menu.updateMany(
        { _id: { $in: restaurant.menus } },
        {
          $addToSet: {
            items: { $each: menuEntry },
          },
        },
      );
    }
  }

  /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

  return res.status(200).json({
    message: "SiteItems assigned to restaurant successfully.",

    restaurantId,

    count: {
      requested: uniqueSiteItemIds.length,

      assigned: assigned.length,

      alreadyAssigned: alreadyAssigned.length,
    },

    assigned,

    alreadyAssigned,
  });
});

/*
|--------------------------------------------------------------------------
| DELETE SITE ITEM RESTAURANT ASSIGNMENTS
|--------------------------------------------------------------------------
|
| DELETE /site-items/assignment/:restaurantId
|
| Body:
|
| {
|   "siteItemIds": [
|     "SITE_ITEM_ID_1",
|     "SITE_ITEM_ID_2"
|   ]
| }
|
| Removes the restaurant from placements.
|
|--------------------------------------------------------------------------
*/

exports.deleteAssignmentsSiteItems = catchAsync(async (req, res) => {
  const { restaurantId } = req.params;

  const { siteItemIds } = req.body;

  /*
    |--------------------------------------------------------------------------
    | VALIDATE RESTAURANT ID
    |--------------------------------------------------------------------------
    */

  if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
    return res.status(400).json({
      message: "Invalid restaurantId.",
    });
  }

  /*
    |--------------------------------------------------------------------------
    | VALIDATE SITE ITEM IDS
    |--------------------------------------------------------------------------
    */

  if (!Array.isArray(siteItemIds) || siteItemIds.length === 0) {
    return res.status(400).json({
      message: "siteItemIds is required and must be a non-empty array.",
    });
  }

  const invalidSiteItemIds = siteItemIds.filter(
    (id) => !mongoose.Types.ObjectId.isValid(id),
  );

  if (invalidSiteItemIds.length > 0) {
    return res.status(400).json({
      message: "One or more SiteItem IDs are invalid.",
      invalidSiteItemIds,
    });
  }

  /*
    |--------------------------------------------------------------------------
    | REMOVE DUPLICATES
    |--------------------------------------------------------------------------
    */

  const uniqueSiteItemIds = [...new Set(siteItemIds.map((id) => String(id)))];

  /*
    |--------------------------------------------------------------------------
    | FIND SITE ITEMS
    |--------------------------------------------------------------------------
    */

  const siteItems = await SiteItem.find({
    _id: {
      $in: uniqueSiteItemIds,
    },
  });

  /*
    |--------------------------------------------------------------------------
    | CHECK MISSING ITEMS
    |--------------------------------------------------------------------------
    */

  const foundIds = new Set(siteItems.map((item) => String(item._id)));

  const missingSiteItemIds = uniqueSiteItemIds.filter(
    (id) => !foundIds.has(String(id)),
  );

  if (missingSiteItemIds.length > 0) {
    return res.status(404).json({
      message: "One or more SiteItems were not found.",
      missingSiteItemIds,
    });
  }

  /*
    |--------------------------------------------------------------------------
    | REMOVE RESTAURANT FROM PLACEMENTS
    |--------------------------------------------------------------------------
    */

  const removed = [];
  const notAssigned = [];

  for (const siteItem of siteItems) {
    const placements = Array.isArray(siteItem.placements)
      ? siteItem.placements
      : [];

    const hasRestaurant = placements.some(
      (placement) => String(placement?.restaurant) === String(restaurantId),
    );

    if (!hasRestaurant) {
      notAssigned.push(siteItem);

      continue;
    }

    siteItem.placements = placements.filter(
      (placement) => String(placement?.restaurant) !== String(restaurantId),
    );

    await siteItem.save();

    removed.push(siteItem);
  }

  /*
    |--------------------------------------------------------------------------
    | SYNC MENU — pull removed items out of the restaurant's menu
    |--------------------------------------------------------------------------
    */

  if (removed.length > 0) {
    const restaurant = await Restaurant.findById(restaurantId).select("menus");

    if (restaurant?.menus?.length > 0) {
      const removedIds = removed.map((si) => si._id);

      await Menu.updateMany(
        { _id: { $in: restaurant.menus } },
        {
          $pull: {
            items: { item: { $in: removedIds } },
          },
        },
      );
    }
  }

  /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

  return res.status(200).json({
    message: "SiteItems removed from restaurant successfully.",

    restaurantId,

    count: {
      requested: uniqueSiteItemIds.length,

      removed: removed.length,

      notAssigned: notAssigned.length,
    },

    removed,

    notAssigned,
  });
});
exports.updateImage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Nenhuma imagem foi enviada.",
      });
    }

    const siteItem = await SiteItem.findById(id);

    if (!siteItem) {
      return res.status(404).json({
        success: false,
        message: "SiteItem não encontrado.",
      });
    }

    let canEditImage = String(req.user?.role || "").toLowerCase() === "admin";
    for (const placement of siteItem.placements || []) {
      if (await canManageRestaurant(req.user, placement.restaurant)) {
        canEditImage = true;
        break;
      }
    }
    if (!canEditImage) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update this image.",
      });
    }

    // ========================================================
    // UPLOAD TO CLOUDINARY
    // ========================================================

    const uploadToCloudinary = () => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: "menupio/site-items",
            resource_type: "image",
            transformation: [
              {
                quality: "auto",
                fetch_format: "auto",
              },
            ],
          },
          (error, result) => {
            if (error) {
              return reject(error);
            }

            resolve(result);
          },
        );

        stream.end(req.file.buffer);
      });
    };

    const result = await uploadToCloudinary();

    // ========================================================
    // OPTIONAL: DELETE OLD CLOUDINARY IMAGE
    // ========================================================

    if (siteItem.image?.[0]) {
      try {
        const oldImageUrl = siteItem.image[0];

        // Extract public_id from old Cloudinary URL
        const match = oldImageUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[^/.]+$/);

        if (match?.[1]) {
          await cloudinary.uploader.destroy(match[1]);
        }
      } catch (deleteError) {
        console.error("Could not delete old Cloudinary image:", deleteError);
      }
    }

    // ========================================================
    // UPDATE DATABASE
    // ========================================================

    siteItem.image = [result.secure_url];

    await siteItem.save();

    // ========================================================
    // RESPONSE
    // ========================================================

    return res.status(200).json({
      success: true,
      message: "Imagem atualizada com sucesso.",
      image: result.secure_url,
      siteItem,
    });
  } catch (error) {
    console.error("updateImage error:", error);

    return res.status(500).json({
      success: false,
      message: "Erro ao atualizar imagem.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
exports.updateImageSettings = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid SiteItem id.",
      });
    }

    const siteItem = await SiteItem.findById(id);

    if (!siteItem) {
      return res.status(404).json({
        message: "SiteItem not found.",
      });
    }

    const { h, w, translateX, translateY } = req.body;
    console.log(req.body);
    /*
     * ---------------------------------------------------------
     * EXISTING SETTINGS
     * ---------------------------------------------------------
     */

    const currentSettings = siteItem.imageSettings || {};

    /*
     * ---------------------------------------------------------
     * UPDATE ONLY PROVIDED VALUES
     * ---------------------------------------------------------
     *
     * This allows the frontend to update one value without
     * destroying the others.
     */

    siteItem.imageSettings = {
      h: typeof h === "string" ? h : currentSettings.h || "105%",

      w: typeof w === "string" ? w : currentSettings.w || "105%",

      translateX:
        typeof translateX === "string"
          ? translateX
          : currentSettings.translateX || "14%",

      translateY:
        typeof translateY === "string"
          ? translateY
          : currentSettings.translateY || "2%",
    };

    await siteItem.save();
    console.log(siteItem);
    return res.status(200).json({
      success: true,
      message: "SiteItem image settings updated successfully.",

      siteItem,

      imageSettings: siteItem.imageSettings,
    });
  } catch (error) {
    console.error("UPDATE SITE ITEM IMAGE SETTINGS ERROR:", error);

    return res.status(500).json({
      message: "Unable to update SiteItem image settings.",
    });
  }
};
