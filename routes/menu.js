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
  getInitialData,
  createSiteMenu,
  getAllMenus,
} = require("../controllers/menu");

/*
|--------------------------------------------------------------------------
| Menus
|--------------------------------------------------------------------------
*/

router
  .route("/")
  .get(auth, getMenus)
  .post(
    auth,
    upload.fields([
      { name: "mainImage", maxCount: 1 },
      { name: "backgroundImage", maxCount: 1 },
    ]),
    createMenu,
  );
router.route("/all").get(auth, getAllMenus);
router.route("/menu").post(auth, upload.single("mainImage"), createSiteMenu);
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
  .get(getMenu)
  .put(
    auth,
    upload.fields([
      { name: "mainImage", maxCount: 1 },
      { name: "backgroundImage", maxCount: 1 },
    ]),
    updateMenu,
  )
  .delete(auth, deleteMenu);
router.route("/:id/initial-data").get(getInitialData);

module.exports = router;
