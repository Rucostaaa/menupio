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
} = require("../controllers/menuItem");

router.route("/").get(getMenuItems).post(auth, createMenuItem);

router
  .route("/:id")
  .get(getMenuItem)
  .put(auth, updateMenuItem)
  .delete(auth, deleteMenuItem);
router.put("/:id/image", auth, upload.single("image"), updateImage);
module.exports = router;
