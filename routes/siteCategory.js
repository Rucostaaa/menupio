const router = require("express").Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/multer");

const {
  createManySiteCategory,
  getSiteCategories,
  getSiteCategory,
  updateSiteCategory,
  setFirstToRender,
  deleteSiteCategory,
  updateManySiteCategories,
  placeSiteCategory,
  removeSiteCategoryPlacement,
  updateSiteCategoryImage,
  placeSiteItemCategory,
  updateImageSettings,
  createSiteCategory,
} = require("../controllers/siteCategory");

router.route("/").get(auth, getSiteCategories).post(auth, createSiteCategory);

router
  .route("/bulk")
  .patch(auth, updateManySiteCategories)
  .post(auth, createManySiteCategory);
router.post("/products/:id/place", auth, placeSiteItemCategory);
router.patch("/:id/first-to-render", auth, setFirstToRender);

router
  .route("/:id")
  .get(auth, getSiteCategory)
  .put(auth, updateSiteCategory)
  .delete(auth, deleteSiteCategory);
router
  .route("/:id/image")
  .patch(auth, upload.single("image"), updateSiteCategoryImage);
router.put("/:id/imageSettings", auth, updateImageSettings);

router.post("/:id/place", auth, placeSiteCategory);

router.delete("/:id/place/:restaurantId", auth, removeSiteCategoryPlacement);

module.exports = router;
