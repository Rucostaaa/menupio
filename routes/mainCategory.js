const router = require("express").Router();

const auth = require("../middleware/auth");

const {
  createManySiteMainCategory,
  getSiteMainCategories,
  getSiteMainCategory,
  updateSiteMainCategory,
  deleteSiteMainCategory,
  updateManySiteMainCategories,
  addCategoryToMainCategory,
  removeCategoryFromMainCategory,
} = require("../controllers/siteMainCategory");

router.route("/").get(auth, getSiteMainCategories);

router
  .route("/bulk")
  .patch(auth, updateManySiteMainCategories)
  .post(auth, createManySiteMainCategory);

router
  .route("/:id")
  .get(auth, getSiteMainCategory)
  .put(auth, updateSiteMainCategory)
  .delete(auth, deleteSiteMainCategory);

router.post("/:id/category/:categoryId", auth, addCategoryToMainCategory);

router.delete(
  "/:id/category/:categoryId",
  auth,
  removeCategoryFromMainCategory,
);

module.exports = router;
