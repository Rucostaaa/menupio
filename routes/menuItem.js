const router = require("express").Router();

const auth = require("../middleware/auth");

const upload = require("../middleware/multer");
const {
  createMenuItem,
  getMenuItems,
  getMenuItem,
  updateMenuItem,
  deleteMenuItem,
  updateImage,
  createProductsBulk,
  getOwnerMenuItem,
  getAllMenuItems,
} = require("../controllers/menuItem");

router
  .route("/")
  .get(auth, getMenuItems)
  .post(auth, createMenuItem)
  .put(auth, createProductsBulk);
router.route("/all/:id").get(auth, getAllMenuItems);
router.route("/owner/:ownerId").get(getOwnerMenuItem);

router
  .route("/:id")
  .get(getMenuItem)
  .put(auth, updateMenuItem)
  .delete(auth, deleteMenuItem);
router.put("/:id/image", auth, upload.single("image"), updateImage);
module.exports = router;
