const express = require("express");

const upload = require("../middleware/upload");
const auth = require("../middleware/auth");

const {
  getImages,
  getImageById,
  createImage,
  updateImage,
  deleteImage,
  createSiteItemImage,
  addFlyerImage,
  updateFlyerImage,
  deleteFlyerImage,
  deleteBackground,
  getSiteItemImage,
} = require("../controllers/image");

const router = express.Router();

// ============================================================
// IMAGE CRUD
// ============================================================

// GET ALL
router.get("/", getImages);
router
  .route("/site-item/:id")
  .get(auth, getSiteItemImage)
  .post(
    auth,
    upload.fields([
      {
        name: "flyer",
        maxCount: 10,
      },
      {
        name: "background",
        maxCount: 1,
      },
    ]),
    createSiteItemImage,
  );

// GET ONE
router.get("/:id", getImageById);

// CREATE
router.post(
  "/",
  upload.fields([
    {
      name: "flyer",
      maxCount: 20,
    },
    {
      name: "background",
      maxCount: 1,
    },
  ]),
  createImage,
);

// UPDATE
router.put(
  "/:id",
  upload.fields([
    {
      name: "flyer",
      maxCount: 20,
    },
    {
      name: "background",
      maxCount: 1,
    },
  ]),
  updateImage,
);

// DELETE
router.delete("/:id", deleteImage);

// ============================================================
// FLYER CRUD
// ============================================================

// ADD ONE FLYER
router.post("/:id/flyer", upload.single("flyer"), addFlyerImage);

// UPDATE ONE FLYER
router.put("/:id/flyer/:flyerId", upload.single("flyer"), updateFlyerImage);

// DELETE ONE FLYER
router.delete("/:id/flyer/:flyerId", deleteFlyerImage);

// DELETE BACKGROUND
router.delete("/:id/background", deleteBackground);

module.exports = router;
