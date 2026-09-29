const router = require("express").Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/multer");
const {
  createCategory,
  getCategories,
  updateCategories,
  deleteCategory,
  updateCategory,
  reorderCategories,
  updateCategoryImage,
  getMainCategories,
  updateMainCategories,
  updateMainCategory,
  deleteMainCategory,
  createMainCategory,
  getBusinessMainCategories,
  getBusinessMainCategoryJson,
  getAllCategories,
} = require("../controllers/category");

router
  .route("/")
  .get(auth, getCategories)
  .post(auth, createCategory)
  .put(auth, updateCategories);
router.put("/reorder", auth, reorderCategories);
router.route("/all/:id").get(auth, getAllCategories);
router
  .route("/main-category")
  .get(auth, getMainCategories)
  .post(auth, createMainCategory)
  .put(auth, updateMainCategories);
router.route("/main-categories").get(auth, getBusinessMainCategoryJson);

router
  .route("/main-category/:id")
  .get(getBusinessMainCategories)
  .put(auth, updateMainCategory)
  .delete(auth, deleteMainCategory);
router.route("/:id").put(auth, updateCategory).delete(auth, deleteCategory);
router
  .route("/:id/image")
  .put(auth, upload.single("image"), updateCategoryImage);

module.exports = router;
