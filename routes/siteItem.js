const router = require("express").Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/multer");

const {
  createSiteItem,
  getSiteItems,
  getSiteItem,
  updateSiteItem,
  deleteSiteItem,
  placeSiteItem,
  removeSiteItemPlacement,
  updateManySiteItems,
  updateAssignmentsSiteItems,
  deleteAssignmentsSiteItems,
  updateImage,
  updateImageSettings,
  getOwnerSiteItems,
} = require("../controllers/siteItem");

// ============================================================
// SITE ITEMS
// ============================================================

router.route("/").get(auth, getSiteItems).post(auth, createSiteItem);
router.route("/owner/:id").get(auth, getOwnerSiteItems);

router.route("/bulk").patch(auth, updateManySiteItems);
router
  .route("/assignment/:restaurantId")
  .patch(auth, updateAssignmentsSiteItems)
  .delete(auth, deleteAssignmentsSiteItems);

router
  .route("/:id")
  .get(auth, getSiteItem)
  .put(auth, updateSiteItem)
  .delete(auth, deleteSiteItem);

// ============================================================
// PLACE SITE ITEM
// ============================================================

router.post("/:id/place", auth, placeSiteItem);
router.delete("/:id/place/:restaurantId", auth, removeSiteItemPlacement);
router.put("/:id/image", auth, upload.single("image"), updateImage);
router.put("/:id/imageSettings", auth, updateImageSettings);

// ============================================================
// REMOVE PLACEMENT
// ============================================================

router.delete(
  "/:id/place/:restaurantId/:categoryId",
  auth,
  removeSiteItemPlacement,
);

module.exports = router;
