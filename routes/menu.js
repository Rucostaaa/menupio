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

router
  .route("/")
  .get(auth, getMenus)
  .post(auth, upload.single("mainImage"), createMenu);

/*
|--------------------------------------------------------------------------
| Restaurant menus
|--------------------------------------------------------------------------
*/

router.route("/get-restaurant-menus").post(auth, getRestaurantMenus);

/*
|--------------------------------------------------------------------------
| Single menu
|--------------------------------------------------------------------------
*/

router
  .route("/:id")
  .get(auth, getMenu)
  .put(auth, upload.single("mainImage"), updateMenu)
  .delete(auth, deleteMenu);

module.exports = router;
