const express = require("express");
const auth = require("../middleware/auth");
const {
  getMyLoyaltyCard,
  getRestaurantLoyaltyUsers,
  stampLoyaltyCard,
  getLoyaltyCards,
  getLoyaltyStampImage,
} = require("../controllers/loyalty");

const router = express.Router();

router.get("/:restaurantId/stamp-image", getLoyaltyStampImage);
router.get("/:restaurantId/card", auth, getMyLoyaltyCard);
router.get("/:restaurantId/users", auth, getRestaurantLoyaltyUsers);
router.post("/:restaurantId/stamp", auth, stampLoyaltyCard);
router.get("/user/loyalty-cards/", auth, getLoyaltyCards);

module.exports = router;
