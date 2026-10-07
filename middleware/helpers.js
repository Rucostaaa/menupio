// helpers/booking.js

const Stripe = require("stripe");

const Booking = require("../models/Booking");
const Restaurant = require("../models/Restaurant");
const User = require("../models/User");
const MenuItem = require("../models/MenuItem");

const {
  isValidObjectId,
  isValidDateString,
  normalizeTime,
  timeToMinutes,
  minutesToTime,
  getScheduleForDate,
  isTimeInsideBreak,
  validateScheduleAvailability,
  hasBookingConflict,
  getFinalDuration,
  getValidItemPrice,
  getStripeAccountId,
  getBookingDateTime,
} = require("../middleware/validation");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* =========================================================
   CONSTANTS
========================================================= */

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];

const BARBER_SELECT =
  "_id name username firstName lastName role avatar avatarUrl profileImage schedule";

const BOOKING_BARBER_SELECT =
  "_id name username firstName lastName avatar avatarUrl profileImage schedule";

const BOOKING_ITEM_SELECT =
  "_id name title description price image duration imageUrl";

const BOOKING_RESTAURANT_SELECT =
  "_id name description address location phone logo mainImage owner employers";

/* =========================================================
   ERROR HELPERS
========================================================= */

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const throwIf = (condition, message, statusCode = 400) => {
  if (condition) {
    throw createError(message, statusCode);
  }
};

/* =========================================================
   STRIPE
========================================================= */

const getConnectedStripe = (stripeAccountId) => {
  if (!stripeAccountId) {
    throw createError("Stripe connected account ID is required.", 400);
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    stripeAccount: stripeAccountId,
  });
};

const createBookingPaymentIntent = async (booking, stripeAccountId) => {
  const connectedStripe = getConnectedStripe(stripeAccountId);

  const paymentIntent = await connectedStripe.paymentIntents.create({
    amount: booking.payment.amount,
    currency: booking.payment.currency || "eur",

    // IMPORTANT:
    // The booking payment is authorized first.
    // It is captured later when the appointment is completed.
    capture_method: "manual",

    automatic_payment_methods: {
      enabled: true,
    },

    metadata: {
      type: "booking",
      bookingId: String(booking._id),
      restaurantId: String(booking.restaurant),
    },
  });

  return paymentIntent;
};

const createOrderPaymentIntent = async (order, stripeAccountId) => {
  const connectedStripe = getConnectedStripe(stripeAccountId);

  return connectedStripe.paymentIntents.create({
    amount: order.payment.amount,
    currency: order.payment.currency || "eur",
    automatic_payment_methods: {
      enabled: true,
    },
    metadata: {
      type: "order",
      bookingId: String(order._id),
      restaurantId: String(order.restaurant),
    },
  });
};

const getBookingPaymentIntent = async (booking) => {
  if (!booking?.payment?.stripePaymentIntentId) {
    throw createError(
      "This booking does not have a Stripe PaymentIntent.",
      400,
    );
  }

  const stripeAccountId =
    booking.payment?.stripeAccountId ||
    (booking.restaurant?.stripe?.accountId
      ? booking.restaurant.stripe.accountId
      : null);

  if (!stripeAccountId) {
    throw createError("Stripe connected account could not be determined.", 400);
  }

  const connectedStripe = getConnectedStripe(stripeAccountId);

  const paymentIntent = await connectedStripe.paymentIntents.retrieve(
    booking.payment.stripePaymentIntentId,
  );

  return {
    connectedStripe,
    paymentIntent,
    stripeAccountId,
  };
};

const updateBookingPaymentFromIntent = (booking, paymentIntent) => {
  if (!booking.payment) {
    booking.payment = {};
  }

  booking.payment.stripePaymentIntentId = paymentIntent.id;

  if (paymentIntent.amount) {
    booking.payment.amount = paymentIntent.amount;
  }

  if (paymentIntent.currency) {
    booking.payment.currency = paymentIntent.currency;
  }

  if (paymentIntent.status === "requires_capture") {
    booking.payment.status = "requires_capture";
    booking.payment.paidAt = null;
    return;
  }

  if (paymentIntent.status === "succeeded") {
    booking.payment.status = "paid";

    if (!booking.payment.paidAt) {
      booking.payment.paidAt = new Date();
    }

    return;
  }

  if (
    paymentIntent.status === "requires_payment_method" ||
    paymentIntent.status === "requires_confirmation"
  ) {
    booking.payment.status = "pending";
    booking.payment.paidAt = null;
    return;
  }

  if (
    paymentIntent.status === "canceled" ||
    paymentIntent.status === "cancelled"
  ) {
    booking.payment.status = "cancelled";
    booking.payment.paidAt = null;
    return;
  }

  if (paymentIntent.status === "processing") {
    booking.payment.status = "processing";
    booking.payment.paidAt = null;
    return;
  }

  booking.payment.status = "failed";
  booking.payment.paidAt = null;
};

const captureBookingPayment = async (booking) => {
  const { connectedStripe, paymentIntent } =
    await getBookingPaymentIntent(booking);

  if (paymentIntent.capture_method !== "manual") {
    throw createError(
      "This booking payment is not configured for manual capture.",
      409,
    );
  }

  if (paymentIntent.status === "succeeded") {
    updateBookingPaymentFromIntent(booking, paymentIntent);

    await booking.save();

    return {
      paymentIntent,
      alreadyCaptured: true,
    };
  }

  if (paymentIntent.status !== "requires_capture") {
    throw createError(
      `Payment cannot be captured while Stripe status is "${paymentIntent.status}".`,
      409,
    );
  }

  const capturedPaymentIntent = await connectedStripe.paymentIntents.capture(
    paymentIntent.id,
  );

  updateBookingPaymentFromIntent(booking, capturedPaymentIntent);

  await booking.save();

  return {
    paymentIntent: capturedPaymentIntent,
    alreadyCaptured: false,
  };
};

const cancelBookingPaymentAuthorization = async (booking) => {
  const { connectedStripe, paymentIntent } =
    await getBookingPaymentIntent(booking);

  if (paymentIntent.status === "requires_capture") {
    const cancelledPaymentIntent = await connectedStripe.paymentIntents.cancel(
      paymentIntent.id,
      {
        cancellation_reason: "requested_by_customer",
      },
    );

    updateBookingPaymentFromIntent(booking, cancelledPaymentIntent);

    booking.payment.status = "cancelled";

    await booking.save();

    return cancelledPaymentIntent;
  }

  if (paymentIntent.status === "succeeded") {
    throw createError(
      "This payment has already been captured and cannot be cancelled as an authorization.",
      409,
    );
  }

  if (
    paymentIntent.status === "canceled" ||
    paymentIntent.status === "cancelled"
  ) {
    booking.payment.status = "cancelled";
    await booking.save();

    return paymentIntent;
  }

  return paymentIntent;
};

/* =========================================================
   CANCELLATION FEE
========================================================= */

const createCancellationFeePayment = async ({
  booking,
  originalPaymentIntent,
}) => {
  const stripeAccountId =
    booking.payment?.stripeAccountId || booking.restaurant?.stripe?.accountId;

  const connectedStripe = getConnectedStripe(stripeAccountId);

  if (!originalPaymentIntent?.payment_method) {
    throw createError(
      "The original payment method is not available for the cancellation fee.",
      409,
    );
  }

  const amount = 200;

  const paymentIntent = await connectedStripe.paymentIntents.create({
    amount,
    currency: originalPaymentIntent.currency || "eur",

    customer: originalPaymentIntent.customer || undefined,

    payment_method: originalPaymentIntent.payment_method,

    confirm: true,
    off_session: true,

    description: `Taxa de cancelamento — Reserva ${booking._id}`,

    metadata: {
      type: "cancellation_fee",
      bookingId: String(booking._id),
      originalPaymentIntentId: originalPaymentIntent.id,
      restaurantId: String(booking.restaurant),
      amount: "2.00",
    },
  });

  return paymentIntent;
};

/* =========================================================
   BOOKING POPULATION
========================================================= */

const populateBooking = (query) => {
  return query
    .populate({
      path: "restaurant",
      select: BOOKING_RESTAURANT_SELECT,
    })
    .populate({
      path: "barber",
      select: BOOKING_BARBER_SELECT,
    })
    .populate({
      path: "item",
      select: BOOKING_ITEM_SELECT,
      strictPopulate: false,
    });
};

const getPopulatedBooking = async (bookingId) => {
  if (!isValidObjectId(bookingId)) {
    throw createError("Invalid booking ID.", 400);
  }

  return populateBooking(Booking.findById(bookingId));
};

/* =========================================================
   BOOKING LOOKUPS
========================================================= */

const getBookingById = async (bookingId) => {
  if (!isValidObjectId(bookingId)) {
    throw createError("Invalid booking ID.", 400);
  }

  const booking = await Booking.findById(bookingId);

  if (!booking) {
    throw createError("Booking not found.", 404);
  }

  return booking;
};

const getBarberById = async (barberId) => {
  if (!isValidObjectId(barberId)) {
    throw createError("Invalid barber ID.", 400);
  }

  const barber = await User.findById(barberId).select(BARBER_SELECT);

  if (!barber) {
    throw createError("Barber not found.", 404);
  }

  return barber;
};

const getRestaurantById = async (restaurantId) => {
  if (!isValidObjectId(restaurantId)) {
    throw createError("Invalid restaurant ID.", 400);
  }

  const restaurant = await Restaurant.findById(restaurantId);

  if (!restaurant) {
    throw createError("Restaurant not found.", 404);
  }

  return restaurant;
};

const getItemById = async (itemId) => {
  if (!isValidObjectId(itemId)) {
    throw createError("Invalid item ID.", 400);
  }

  const item = await MenuItem.findById(itemId);

  if (!item) {
    throw createError("Menu item not found.", 404);
  }

  return item;
};

/* =========================================================
   CREATE BOOKING DATA
========================================================= */

const prepareBookingData = async ({
  restaurantId,
  barberId,
  itemId,
  date,
  time,
  duration,
}) => {
  throwIf(!restaurantId, "Restaurant is required.");

  throwIf(!barberId, "Barber is required.");

  throwIf(!itemId, "Item is required.");

  throwIf(!isValidDateString(date), "Date must use YYYY-MM-DD format.");

  const normalizedTime = normalizeTime(time);

  throwIf(!normalizedTime, "Time must use HH:mm format.");

  const restaurant = await getRestaurantById(restaurantId);

  const barber = await getBarberById(barberId);

  const item = await getItemById(itemId);

  const belongsToRestaurant =
    Array.isArray(restaurant.employers) &&
    restaurant.employers.some(
      (employer) =>
        String(employer?._id || employer?.user || employer) ===
        String(barber._id),
    );

  if (!belongsToRestaurant) {
    throw createError(
      "The selected barber does not belong to this restaurant.",
      403,
    );
  }

  const finalDuration = getFinalDuration(duration, item);

  const itemPrice = getValidItemPrice(item);

  const scheduleValidation = validateScheduleAvailability({
    barber,
    date,
    time: normalizedTime,
    duration: finalDuration,
  });

  if (!scheduleValidation.available) {
    throw createError(scheduleValidation.message, 409);
  }

  const conflict = await hasBookingConflict({
    barberId: barber._id,
    date,
    time: normalizedTime,
    duration: finalDuration,
  });

  if (conflict) {
    throw createError("The selected booking time is no longer available.", 409);
  }

  return {
    restaurant,
    barber,
    item,
    date,
    normalizedTime,
    finalDuration,
    itemPrice,
  };
};

/* =========================================================
   AVAILABILITY
========================================================= */

const getAvailableSlots = async ({ barberId, date, duration }) => {
  if (!isValidObjectId(barberId)) {
    throw createError("Invalid barber ID.", 400);
  }

  if (!isValidDateString(date)) {
    throw createError("Date must use YYYY-MM-DD format.", 400);
  }

  const requestedDuration = Number(duration);

  if (!Number.isFinite(requestedDuration) || requestedDuration <= 0) {
    throw createError("Invalid duration.", 400);
  }

  const barber = await getBarberById(barberId);

  const schedule = getScheduleForDate(barber, date);

  if (!schedule.enabled) {
    return {
      date,
      barberId,
      duration: requestedDuration,
      slots: [],
      availableSlots: [],
    };
  }

  const scheduleStart = timeToMinutes(schedule.startTime);

  const scheduleEnd = timeToMinutes(schedule.endTime);

  if (
    scheduleStart === null ||
    scheduleEnd === null ||
    scheduleEnd <= scheduleStart
  ) {
    return {
      date,
      barberId,
      duration: requestedDuration,
      slots: [],
      availableSlots: [],
    };
  }

  const bookings = await Booking.find({
    barber: barberId,
    date,
    status: {
      $in: ACTIVE_BOOKING_STATUSES,
    },
  }).select("time duration status");

  const slots = [];

  for (
    let current = scheduleStart;
    current + requestedDuration <= scheduleEnd;
    current += 15
  ) {
    const slotStart = current;
    const slotEnd = current + requestedDuration;

    if (isTimeInsideBreak(slotStart, slotEnd, schedule.breaks)) {
      continue;
    }

    const hasConflict = bookings.some((booking) => {
      const bookingStart = timeToMinutes(booking.time);

      if (bookingStart === null) {
        return false;
      }

      const bookingEnd = bookingStart + Number(booking.duration || 0);

      return slotStart < bookingEnd && slotEnd > bookingStart;
    });

    if (!hasConflict) {
      slots.push(minutesToTime(current));
    }
  }

  return {
    date,
    barberId,
    duration: requestedDuration,
    slots,
    availableSlots: slots,
  };
};

/* =========================================================
   BOOKING QUERIES
========================================================= */

const getBookingsForBarber = async ({
  barberId,
  date,
  startDate,
  endDate,
  status,
}) => {
  if (!isValidObjectId(barberId)) {
    throw createError("Invalid barber ID.", 400);
  }

  const query = {
    barber: barberId,
  };

  if (date) {
    if (!isValidDateString(date)) {
      throw createError("Date must use YYYY-MM-DD format.", 400);
    }

    query.date = date;
  } else if (startDate || endDate) {
    query.date = {};

    if (startDate) {
      if (!isValidDateString(startDate)) {
        throw createError("Invalid startDate.", 400);
      }

      query.date.$gte = startDate;
    }

    if (endDate) {
      if (!isValidDateString(endDate)) {
        throw createError("Invalid endDate.", 400);
      }

      query.date.$lte = endDate;
    }
  }

  if (status) {
    query.status = status;
  }

  return populateBooking(
    Booking.find(query).sort({
      date: 1,
      time: 1,
    }),
  );
};

const getBookingsForRestaurant = async ({
  restaurantId,
  date,
  startDate,
  endDate,
  status,
}) => {
  if (!isValidObjectId(restaurantId)) {
    throw createError("Invalid restaurant ID.", 400);
  }

  const query = {
    restaurant: restaurantId,
    kind: { $ne: "order" },
  };

  if (date) {
    if (!isValidDateString(date)) {
      throw createError("Date must use YYYY-MM-DD format.", 400);
    }

    query.date = date;
  } else if (startDate || endDate) {
    query.date = {};

    if (startDate) {
      if (!isValidDateString(startDate)) {
        throw createError("Invalid startDate.", 400);
      }

      query.date.$gte = startDate;
    }

    if (endDate) {
      if (!isValidDateString(endDate)) {
        throw createError("Invalid endDate.", 400);
      }

      query.date.$lte = endDate;
    }
  }

  if (status) {
    query.status = status;
  }

  return populateBooking(
    Booking.find(query).sort({
      date: 1,
      time: 1,
    }),
  );
};

const getBookingsForUser = async (userId) => {
  if (!isValidObjectId(userId)) {
    throw createError("Invalid user ID.", 400);
  }

  return populateBooking(
    Booking.find({
      user: userId,
    }).sort({
      date: -1,
      time: -1,
    }),
  );
};

/* =========================================================
   UPDATE BOOKING
========================================================= */

const prepareBookingUpdate = async ({ booking, updates }) => {
  const allowedFields = [
    "date",
    "time",
    "duration",
    "notes",
    "status",
    "cancellationReason",
    "barberId",
  ];

  const requestedFields = Object.keys(updates);

  const invalidField = requestedFields.find(
    (field) => !allowedFields.includes(field),
  );

  if (invalidField) {
    throw createError(`Field "${invalidField}" cannot be updated.`, 400);
  }

  let barberId = booking.barber;

  if (updates.barberId !== undefined) {
    if (!isValidObjectId(updates.barberId)) {
      throw createError("Invalid barber ID.", 400);
    }

    barberId = updates.barberId;
  }

  const date = updates.date !== undefined ? updates.date : booking.date;

  const time =
    updates.time !== undefined
      ? normalizeTime(updates.time)
      : normalizeTime(booking.time);

  if (!isValidDateString(date)) {
    throw createError("Date must use YYYY-MM-DD format.", 400);
  }

  if (!time) {
    throw createError("Time must use HH:mm format.", 400);
  }

  const barber = await getBarberById(barberId);

  const restaurant = await getRestaurantById(booking.restaurant);

  const belongsToRestaurant =
    Array.isArray(restaurant.employers) &&
    restaurant.employers.some(
      (employer) =>
        String(employer?._id || employer?.user || employer) ===
        String(barber._id),
    );

  if (!belongsToRestaurant) {
    throw createError(
      "The selected barber does not belong to this restaurant.",
      403,
    );
  }

  let duration = Number(
    updates.duration !== undefined ? updates.duration : booking.duration,
  );

  if (!Number.isFinite(duration) || duration <= 0) {
    duration = getFinalDuration(undefined, booking.item);
  }

  const item = await getItemById(booking.item);

  duration = getFinalDuration(duration, item);

  const scheduleValidation = validateScheduleAvailability({
    barber,
    date,
    time,
    duration,
  });

  if (!scheduleValidation.available) {
    throw createError(scheduleValidation.message, 409);
  }

  const conflict = await hasBookingConflict({
    barberId: barber._id,
    date,
    time,
    duration,
    excludeBookingId: booking._id,
  });

  if (conflict) {
    throw createError("The selected booking time is no longer available.", 409);
  }

  return {
    barber,
    date,
    time,
    duration,
  };
};

/* =========================================================
   CLAIM BOOKING
========================================================= */

const claimBookingForUser = async ({ booking, userId }) => {
  if (!isValidObjectId(userId)) {
    throw createError("Invalid user ID.", 400);
  }

  const user = await User.findById(userId);

  if (!user) {
    throw createError("User not found.", 404);
  }

  if (booking.user) {
    if (String(booking.user) === String(user._id)) {
      return populateBooking(Booking.findById(booking._id));
    }

    throw createError(
      "This booking is already associated with another account.",
      409,
    );
  }

  booking.user = user._id;

  await booking.save();

  if (!Array.isArray(user.bookings)) {
    user.bookings = [];
  }

  const alreadyExists = user.bookings.some(
    (bookingId) => String(bookingId) === String(booking._id),
  );

  if (!alreadyExists) {
    user.bookings.push(booking._id);
    await user.save();
  }

  return populateBooking(Booking.findById(booking._id));
};

/* =========================================================
   BOOKING RESPONSE
========================================================= */

const sendBookingResponse = (
  res,
  { statusCode = 200, message, booking, extra = {} },
) => {
  return res.status(statusCode).json({
    success: true,
    ...(message ? { message } : {}),
    ...(booking ? { booking } : {}),
    ...extra,
  });
};

const sendBookingError = (res, error, fallbackMessage) => {
  console.error("BOOKING ERROR:", error);

  return res.status(error?.statusCode || 500).json({
    success: false,
    message: error?.message || fallbackMessage || "Booking request failed.",
  });
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  ACTIVE_BOOKING_STATUSES,

  getConnectedStripe,

  createBookingPaymentIntent,
  createOrderPaymentIntent,
  getBookingPaymentIntent,
  updateBookingPaymentFromIntent,
  captureBookingPayment,
  cancelBookingPaymentAuthorization,
  createCancellationFeePayment,

  populateBooking,
  getPopulatedBooking,

  getBookingById,
  getBarberById,
  getRestaurantById,
  getItemById,

  prepareBookingData,
  getAvailableSlots,

  getBookingsForBarber,
  getBookingsForRestaurant,
  getBookingsForUser,

  prepareBookingUpdate,

  claimBookingForUser,

  sendBookingResponse,
  sendBookingError,
};
