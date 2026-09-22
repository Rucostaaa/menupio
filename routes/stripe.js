const express = require("express");

const router = express.Router();

const {
  connectStripe,
  getStripeStatus,
  getStripeProducts,
  createStripeProduct,
  updateStripeProduct,
  updateStripePrice,
  updateVendorMode,
  deleteStripeProduct,
  createStripePrice,
} = require("../controllers/stripe");

const auth = require("../middleware/auth");

router.post("/connect", auth, connectStripe);

router.get("/status", auth, getStripeStatus);

router
  .route("/products")
  .get(auth, getStripeProducts)
  .post(auth, createStripeProduct);

router
  .route("/products/:productId")
  .patch(auth, updateStripeProduct)
  .delete(auth, deleteStripeProduct);

router.post("/products/:productId/prices", auth, createStripePrice);

router.patch("/prices/:priceId", auth, updateStripePrice);

router.patch("/vendor-mode", auth, updateVendorMode);

module.exports = router;
