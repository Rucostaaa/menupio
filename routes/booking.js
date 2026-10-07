const express = require("express");

const router = express.Router();

const {
  createBooking,
  getBooking,
  getBarberBookings,
  getCustomerBookings,
  getAvailability,
  updateBooking,
  cancelBooking,
  confirmBooking,
  completeBooking,
  markNoShow,
  deleteBooking,
  sendBookingEmail,
  claimBooking,
  getUserBookings,
  updateBookingPayment,
  retryCaptureBookingPayment,
} = require("../controllers/booking");
const auth = require("../middleware/auth");
const {
  getRestaurantOrders,
  updateRestaurantOrderStatus,
  createMenuOrder,
  createOrderPaymentIntentForFollow,
  syncOrderPayment,
} = require("../controllers/order");
router.get("/orders/restaurant", auth, getRestaurantOrders);
router.patch("/orders/:orderId/status", auth, updateRestaurantOrderStatus);
router.post("/orders", createMenuOrder);
router.post("/orders/:orderId/payment-intent", createOrderPaymentIntentForFollow);
router.post("/orders/:orderId/payment", syncOrderPayment);
router.post("/", createBooking);
router.post("/email/:bookingId", sendBookingEmail);
router.get("/barber/:barberId", getBarberBookings);

router.get("/barber/:barberId/availability", getAvailability);

router.get("/customer/:customerId", getCustomerBookings);
router.get("/user/:userId", getUserBookings);
router.patch("/:bookingId/payment", auth, updateBookingPayment);
router.post("/:bookingId/paymentRetry", auth, retryCaptureBookingPayment);

router.get("/:id", getBooking);

router.patch("/:id/cancel", auth, cancelBooking);

router.patch("/:id/confirm", confirmBooking);
router.patch("/:id/claim", auth, claimBooking);
router.patch("/:id/complete", completeBooking);

router.patch("/:id/no-show", markNoShow);

router.patch("/:id", updateBooking);

router.delete("/:id", deleteBooking);

module.exports = router;
