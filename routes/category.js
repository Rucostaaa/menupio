const router = require("express").Router();

const auth = require("../middleware/auth");

const {
  createCategory,
  getCategories,
  updateCategories,
  deleteCategory,
  updateCategory,
  reorderCategories,
} = require("../controllers/category");

router
  .route("/")
  .get(auth, getCategories)
  .post(auth, createCategory)
  .put(auth, updateCategories);
router.put("/reorder", auth, reorderCategories);
router.route("/:id").put(auth, updateCategory).delete(auth, deleteCategory);

module.exports = router;
