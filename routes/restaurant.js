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
  updateMainImage,
} = require("../controllers/restaurant");

router.route("/").get(auth, getRestaurants).post(auth, createRestaurant);

router
  .route("/:id")
  .get(getRestaurant)
  .put(auth, updateRestaurant)
  .delete(auth, deleteRestaurant);

router.put("/:id/logo", auth, upload.single("logo"), updateLogo);

router.put("/:id/mainImage", auth, upload.single("mainImage"), updateMainImage);

module.exports = router;
