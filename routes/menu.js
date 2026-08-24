const router = require("express").Router();

const auth = require("../middleware/auth");
const upload = require("../middleware/upload");

const {
  createMenu,
  getMenus,
  updateMenu,
  deleteMenu,
  getRestaurantMenus,
  getMenu,
} = require("../controllers/menu");

/*
|--------------------------------------------------------------------------
| Menus
|--------------------------------------------------------------------------
*/

// Get all menus for authenticated restaurant
// Create menu with optional main image
router
  .route("/")
  .get(auth, getMenus)
  .post(auth, upload.single("mainImage"), createMenu);

/*
|--------------------------------------------------------------------------
| Restaurant menus
|--------------------------------------------------------------------------
*/

// Public/private depending on your auth requirement
router.route("/get-restaurant-menus").post(auth, getRestaurantMenus);

/*
|--------------------------------------------------------------------------
| Single menu
|--------------------------------------------------------------------------
*/

router
  .route("/:id")
  .put(auth, updateMenu)
  .delete(auth, deleteMenu)
  .post(getMenu);

module.exports = router;
