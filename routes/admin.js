const {
  getAllRestaurants,
  getAllProducts,
  bulkProducts,
  bulkCategories,
  getAllUsers,
  updateMenu,
  deleteMenu,
  createRestaurant,
  createSingleProduct,
  getAllMenus,
  updateAdminUserRole,
  bulkMenu,
} = require("../controllers/admin");
const auth = require("../middleware/auth");

const router = require("express").Router();

router
  .route("/restaurant")
  .get(auth, getAllRestaurants)
  .post(auth, createRestaurant);

router.route("/products").post(auth, createSingleProduct);

router
  .route("/products/bulk")
  .get(auth, getAllProducts)
  .post(auth, bulkProducts);
router.put("/categories/bulk", bulkCategories);
router.post("/restaurant/:id/bulk", bulkMenu);

router.route("/users").get(auth, getAllUsers);
router.route("/screens").get(auth, getAllMenus);
router.route("/screen/:id").put(auth, updateMenu).delete(auth, deleteMenu);
router.patch("/users/:id/role", auth, updateAdminUserRole);
module.exports = router;
