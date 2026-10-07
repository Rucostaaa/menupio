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
const allowedRoles = require("../middleware/allowedRoles");

const router = require("express").Router();

router.use(auth, allowedRoles(["Admin"]));

router
  .route("/restaurant")
  .get(getAllRestaurants)
  .post(createRestaurant);

router.route("/products").post(createSingleProduct);

router
  .route("/products/bulk")
  .get(getAllProducts)
  .post(bulkProducts);
router.put("/categories/bulk", bulkCategories);
router.post("/restaurant/:id/bulk", bulkMenu);

router.route("/users").get(getAllUsers);
router.route("/screens").get(getAllMenus);
router.route("/screen/:id").put(updateMenu).delete(deleteMenu);
router.patch("/users/:id/role", updateAdminUserRole);
router.use("/subscription-plans", require("./subscriptionPlans"));
module.exports = router;
