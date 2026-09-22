const Booking = require("../models/Booking");
const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");
const User = require("../models/User");
export const findBooking = async ({ bookingId, select, populationValues }) => {
  const booking = await Booking.findById(bookingId);
  populationValues.array.forEach((item) => {
    booking.populate(item);
  });
  return booking;
};
