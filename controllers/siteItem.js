const mongoose = require("mongoose");
const catchAsync = require("./../utils/catchAsync");
const SiteItem = require("../models/SiteItem");
const Restaurant = require("../models/Restaurant");
const Category = require("../models/Category");
const SiteCategory = require("../models/SiteCategory");
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

  console.log("getOwnerSiteItems id", req.params);
  try {
    const siteItems = await SiteItem.find({
      "placements.restaurant": id,
    })
      .populate({
        path: "category",
        model: "SiteCategory",
      })
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
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        siteItem[field] = req.body[field];
      }
    });

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

    siteItem.placements.push({
      restaurant: restaurantId,
      category: categoryId,
    });

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
    if (!requireAdmin(req, res)) {
      return;
    }

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

    // ----------------------------------------------------------
    // FIND PLACEMENT
    // ----------------------------------------------------------

    const placementExists = siteItem.placements.some(
      (placement) =>
        String(placement.restaurant) === String(restaurantId) &&
        String(placement.category) === String(categoryId),
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
          String(placement.category) === String(categoryId)
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

    // ==========================================================
    // CREATED
    // ==========================================================

    const createdItems = itemsToCreate.map((item) => ({
      name: item.name && typeof item.name === "object" ? item.name : {},

      description:
        item.description && typeof item.description === "object"
          ? item.description
          : {},

      image: Array.isArray(item.image) ? item.image : [],

      ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],

      alerts: Array.isArray(item.alerts) ? item.alerts : [],

      allergens: Array.isArray(item.allergens) ? item.allergens : [],

      // New items always start with no placements.
      placements: [],
    }));

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

    siteItem.placements.push({
      restaurant: restaurantId,
    });

    await siteItem.save();

    assigned.push(siteItem);
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
