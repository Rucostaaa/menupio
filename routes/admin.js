const {
  getAllRestaurants,
  getAllProducts,
  bulkProducts,
  getAllUsers,
  cloneMenu,
  updateMenu,
  deleteMenu,
  createRestaurant,
  createSingleProduct,
  getAllMenus,
} = require("../controllers/admin");
const auth = require("../middleware/auth");

const router = require("express").Router();

router
  .route("/restaurant")
  .get(auth, getAllRestaurants)
  .post(auth, createRestaurant);
router.route("/products").post(auth, createSingleProduct);

router
  .route("/products-categories")
  .get(auth, getAllProducts)
  .post(auth, bulkProducts);

router.route("/users").get(auth, getAllUsers);
router.route("/screens").get(auth, getAllMenus);
router
  .route("/screen/:id")
  .post(auth, cloneMenu)
  .put(auth, updateMenu)
  .delete(auth, deleteMenu);

module.exports = router;
