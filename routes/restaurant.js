const router = require("express").Router();

const auth = require("../middleware/auth");

const upload = require("../middleware/multer");

const {
  createRestaurant,
  getRestaurants,
  getRestaurant,
  updateRestaurant,
  deleteRestaurant,
  updateLogo,
} = require("../controllers/restaurant");

router.route("/").get(auth, getRestaurants).post(auth, createRestaurant);

router
  .route("/:id")
  .get(getRestaurant)
  .put(auth, updateRestaurant)
  .delete(auth, deleteRestaurant);
router.put("/:id/logo", auth, upload.single("logo"), updateLogo);

module.exports = router;
