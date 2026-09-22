const express = require("express");
const auth = require("../middleware/auth");
const {
  getMyLoyaltyCard,
  getRestaurantLoyaltyUsers,
  stampLoyaltyCard,
} = require("../controllers/loyalty");

const router = express.Router();

router.get("/:restaurantId/card", auth, getMyLoyaltyCard);
router.get("/:restaurantId/users", auth, getRestaurantLoyaltyUsers);
router.post("/:restaurantId/stamp", auth, stampLoyaltyCard);

module.exports = router;
