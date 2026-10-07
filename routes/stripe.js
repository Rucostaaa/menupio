const express = require("express");

const router = express.Router();

const {
  connectStripe,
  getStripeStatus,
  getStripeMenuItems,
  getStripeProducts,
  createStripeProduct,
  updateStripeProduct,
  updateStripePrice,
  updateVendorMode,
  deleteStripeProduct,
  createStripePrice,
  getStripeFinance,
  updateStripePayoutSchedule,
} = require("../controllers/stripe");

const auth = require("../middleware/auth");

router.post("/connect", auth, connectStripe);

router.get("/status", auth, getStripeStatus);
router.get("/menu-items", auth, getStripeMenuItems);

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
router.get("/finance", auth, getStripeFinance);
router.patch("/payout-schedule", auth, updateStripePayoutSchedule);

module.exports = router;
