const express = require("express");

const {
  createReview,
  getReviewByBooking,
  getMyReviews,
  getRestaurantReviews,
  getBarberReviews,
} = require("../controllers/review.js");

const auth = require("../middleware/auth.js");

const router = express.Router();

/*
 * Customer reviews
 */

router.post("/", auth, createReview);

router.get("/me", auth, getMyReviews);

router.get("/booking/:bookingId", auth, getReviewByBooking);

/*
 * Public/business review endpoints
 */

router.get("/restaurant/:restaurantId", getRestaurantReviews);

router.get("/barber/:barberId", getBarberReviews);

module.exports = router;
