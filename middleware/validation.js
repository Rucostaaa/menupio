// middleware/validation.js

const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const Restaurant = require("../models/Restaurant");
const User = require("../models/User");

// ============================================================
// CONSTANTS
// ============================================================

const BOOKING_TYPES = ["online", "walkin"];

const ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"];

const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
];

const PAYMENT_STATUSES = [
  "not_required",
  "pending",
  "processing",
  "requires_capture",
  "paid",
  "failed",
  "cancelled",
  "refunded",
];

// ============================================================
// ERROR HELPERS
// ============================================================

const createValidationError = (message, statusCode = 400) => {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
};

// ============================================================
// OBJECT ID
// ============================================================

const isValidObjectId = (value) => {
  return mongoose.Types.ObjectId.isValid(value);
};

const assertValidObjectId = (value, message = "Invalid ID.") => {
  if (!value || !isValidObjectId(value)) {
    throw createValidationError(message, 400);
  }

  return true;
};

// ============================================================
// BOOKING TYPE
// ============================================================

const isValidBookingType = (type) => {
  return BOOKING_TYPES.includes(type);
};

const assertValidBookingType = (type) => {
  if (!isValidBookingType(type)) {
    throw createValidationError("Invalid booking type.", 400);
  }

  return true;
};

// ============================================================
// DATE
// ============================================================

const isValidDateString = (date) => {
  if (!date || typeof date !== "string") {
    return false;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  /*
   * Prevent JavaScript from accepting things like:
   *
   * 2026-02-31
   *
   * which can otherwise roll over into March.
   */

  const [year, month, day] = date.split("-").map(Number);

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
};

const assertValidDateString = (date) => {
  if (!isValidDateString(date)) {
    throw createValidationError("Date must use YYYY-MM-DD format.", 400);
  }

  return true;
};

const getBookingDate = (date) => {
  if (!isValidDateString(date)) {
    return null;
  }

  const parsed = new Date(`${date}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

// ============================================================
// DAY / SCHEDULE
// ============================================================

const getDayName = (date) => {
  const parsed = getBookingDate(date);

  if (!parsed) {
    return null;
  }

  return [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][parsed.getDay()];
};

const getScheduleForDate = (barber, date) => {
  const schedule = barber?.schedule;

  /*
   * No schedule configured:
   * keep the current fallback behavior.
   */

  if (!schedule) {
    return {
      enabled: true,
      startTime: "09:00",
      endTime: "18:00",
      breaks: [],
    };
  }

  const dayName = getDayName(date);

  if (!dayName) {
    return {
      enabled: false,
      startTime: "09:00",
      endTime: "18:00",
      breaks: [],
    };
  }

  const possibleKeys = [
    dayName,
    dayName.slice(0, 3),
    dayName.charAt(0).toUpperCase() + dayName.slice(1),
  ];

  let daySchedule = null;

  for (const key of possibleKeys) {
    if (schedule[key]) {
      daySchedule = schedule[key];
      break;
    }
  }

  /*
   * Support a flat schedule:
   *
   * {
   *   enabled,
   *   startTime,
   *   endTime,
   *   breaks
   * }
   */

  if (!daySchedule) {
    if (
      typeof schedule.enabled === "boolean" ||
      schedule.startTime ||
      schedule.endTime ||
      Array.isArray(schedule.breaks)
    ) {
      return {
        enabled:
          typeof schedule.enabled === "boolean" ? schedule.enabled : true,

        startTime: schedule.startTime || "09:00",

        endTime: schedule.endTime || "18:00",

        breaks: Array.isArray(schedule.breaks) ? schedule.breaks : [],
      };
    }

    /*
     * No specific day configuration:
     * preserve current fallback.
     */

    return {
      enabled: true,
      startTime: "09:00",
      endTime: "18:00",
      breaks: [],
    };
  }

  return {
    enabled:
      typeof daySchedule.enabled === "boolean" ? daySchedule.enabled : true,

    startTime: daySchedule.startTime || "09:00",

    endTime: daySchedule.endTime || "18:00",

    breaks: Array.isArray(daySchedule.breaks) ? daySchedule.breaks : [],
  };
};

// ============================================================
// TIME
// ============================================================

const normalizeTime = (time) => {
  if (!time || typeof time !== "string") {
    return null;
  }

  const normalized = time.trim();

  const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    return null;
  }

  return normalized;
};

const assertValidTime = (time) => {
  const normalizedTime = normalizeTime(time);

  if (!normalizedTime) {
    throw createValidationError("Time must use HH:mm format.", 400);
  }

  return normalizedTime;
};

const timeToMinutes = (time) => {
  const normalized = normalizeTime(time);

  if (!normalized) {
    return null;
  }

  const [hours, minutes] = normalized.split(":").map(Number);

  return hours * 60 + minutes;
};

const minutesToTime = (minutes) => {
  if (!Number.isFinite(minutes) || minutes < 0) {
    return null;
  }

  const hours = Math.floor(minutes / 60);

  const remainingMinutes = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(remainingMinutes).padStart(
    2,
    "0",
  )}`;
};

// ============================================================
// BREAKS
// ============================================================

const isTimeInsideBreak = (startMinutes, endMinutes, breaks = []) => {
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    return false;
  }

  return breaks.some((breakItem) => {
    const breakStart = timeToMinutes(breakItem?.startTime);

    const breakEnd = timeToMinutes(breakItem?.endTime);

    if (breakStart === null || breakEnd === null || breakEnd <= breakStart) {
      return false;
    }

    return startMinutes < breakEnd && endMinutes > breakStart;
  });
};

// ============================================================
// DURATION
// ============================================================

const getFinalDuration = (duration, item) => {
  const requestedDuration = Number(duration);

  const itemDuration = Number(item?.duration);

  const finalDuration =
    Number.isFinite(requestedDuration) && requestedDuration > 0
      ? requestedDuration
      : itemDuration;

  if (!Number.isFinite(finalDuration) || finalDuration <= 0) {
    throw createValidationError("Invalid booking duration.", 400);
  }

  return finalDuration;
};

// ============================================================
// PRICE
// ============================================================

const getValidItemPrice = (item) => {
  const itemPrice = Number(item?.price);

  if (!Number.isFinite(itemPrice) || itemPrice < 0) {
    throw createValidationError(
      "The service does not have a valid price.",
      400,
    );
  }

  return itemPrice;
};

// ============================================================
// SCHEDULE AVAILABILITY
// ============================================================

const validateScheduleAvailability = ({ barber, date, time, duration }) => {
  const schedule = getScheduleForDate(barber, date);

  if (!schedule.enabled) {
    return {
      available: false,
      message: "O barbeiro não trabalha neste dia.",
    };
  }

  const startMinutes = timeToMinutes(time);

  const durationMinutes = Number(duration);

  if (
    startMinutes === null ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return {
      available: false,
      message: "Horário ou duração inválidos.",
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
      available: false,
      message: "O horário de trabalho do barbeiro é inválido.",
    };
  }

  const bookingEnd = startMinutes + durationMinutes;

  if (startMinutes < scheduleStart || bookingEnd > scheduleEnd) {
    return {
      available: false,
      message: "O horário escolhido está fora do horário de trabalho.",
    };
  }

  if (isTimeInsideBreak(startMinutes, bookingEnd, schedule.breaks)) {
    return {
      available: false,
      message: "O horário escolhido coincide com uma pausa.",
    };
  }

  return {
    available: true,
  };
};

// ============================================================
// DATABASE ENTITY VALIDATION
// ============================================================

const assertRestaurantExists = (restaurant) => {
  if (!restaurant) {
    throw createValidationError("Restaurant not found.", 404);
  }

  return restaurant;
};

const assertBarberExists = (barber) => {
  if (!barber) {
    throw createValidationError("Barber not found.", 404);
  }

  return barber;
};

const assertItemExists = (item) => {
  if (!item) {
    throw createValidationError("Product/Service not found.", 404);
  }

  return item;
};

// ============================================================
// RESTAURANT / BARBER RELATIONSHIP
// ============================================================

const isBarberRestaurantEmployer = (restaurant, barber) => {
  if (!restaurant || !barber) {
    return false;
  }

  const restaurantHasBarber =
    restaurant.employers?.some(
      (employer) => String(employer) === String(barber._id),
    ) || String(restaurant.owner) === String(barber._id);

  return Boolean(restaurantHasBarber);
};

const assertBarberBelongsToRestaurant = (restaurant, barber) => {
  if (!isBarberRestaurantEmployer(restaurant, barber)) {
    throw createValidationError(
      "This barber does not belong to this restaurant.",
      400,
    );
  }

  return true;
};

// ============================================================
// BOOKING CONFLICT
// ============================================================

const hasBookingConflict = async ({
  barberId,
  date,
  time,
  duration,
  excludeBookingId = null,
}) => {
  const requestedStart = timeToMinutes(time);

  const durationMinutes = Number(duration);

  if (
    requestedStart === null ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  ) {
    return true;
  }

  const requestedEnd = requestedStart + durationMinutes;

  const query = {
    barber: barberId,

    date,

    status: {
      $in: ACTIVE_BOOKING_STATUSES,
    },
  };

  if (excludeBookingId && isValidObjectId(excludeBookingId)) {
    query._id = {
      $ne: excludeBookingId,
    };
  }

  const bookings = await Booking.find(query)
    .select("time duration status")
    .lean();

  return bookings.some((booking) => {
    const bookingStart = timeToMinutes(booking.time);

    if (bookingStart === null) {
      return false;
    }

    const bookingDuration = Number(booking.duration || 0);

    const bookingEnd = bookingStart + bookingDuration;

    return requestedStart < bookingEnd && requestedEnd > bookingStart;
  });
};

// ============================================================
// OWNER RESTAURANT
// ============================================================

const getOwnerRestaurant = async (userId) => {
  assertValidObjectId(userId, "Invalid user ID.");

  const restaurant = await Restaurant.findOne({
    owner: userId,
  });

  if (!restaurant) {
    throw createValidationError("Restaurante não encontrado.", 404);
  }

  return restaurant;
};

// ============================================================
// BOOKING PERMISSIONS
// ============================================================

const canManageBooking = async (req, booking) => {
  if (!req?.user?._id || !booking) {
    return false;
  }

  const userId = String(req.user._id);

  /*
   * Customer who owns the booking.
   */

  if (booking.user && String(booking.user) === userId) {
    return true;
  }

  /*
   * Barber assigned to the booking.
   */

  if (booking.barber && String(booking.barber) === userId) {
    return true;
  }

  /*
   * Restaurant owner.
   *
   * This avoids relying exclusively
   * on the booking's populated restaurant.
   */

  if (booking.restaurant) {
    const restaurant = await Restaurant.findById(booking.restaurant).select(
      "owner",
    );

    if (restaurant && String(restaurant.owner) === userId) {
      return true;
    }
  }

  return false;
};

// ============================================================
// STRIPE ACCOUNT
// ============================================================

const getStripeAccountId = (restaurant) => {
  const accountId = restaurant?.stripe?.accountId;

  if (!accountId) {
    throw createValidationError(
      "Este negócio ainda não tem uma conta Stripe ligada.",
      400,
    );
  }

  return accountId;
};

// ============================================================
// BOOKING DATE / TIME
// ============================================================

const getBookingDateTime = (booking) => {
  if (!booking?.date || !booking?.time) {
    return null;
  }

  const normalizedTime = normalizeTime(String(booking.time));

  if (!normalizedTime) {
    return null;
  }

  const dateString = String(booking.date).slice(0, 10);

  if (!isValidDateString(dateString)) {
    return null;
  }

  const date = new Date(`${dateString}T${normalizedTime}:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

// ============================================================
// CANCELLATION POLICY
// ============================================================

const getCancellationPolicy = (booking) => {
  const appointmentTime = getBookingDateTime(booking);

  /*
   * If the booking date/time cannot
   * be calculated, don't block the
   * operation here. The controller
   * can handle the invalid booking.
   */

  if (!appointmentTime) {
    return {
      validDateTime: false,

      minutesUntilAppointment: null,

      canCancel: true,

      hasFee: false,

      fee: 0,

      feeAmountCents: 0,

      isRestricted: false,

      message: "",
    };
  }

  const now = new Date();

  const minutesUntilAppointment = Math.floor(
    (appointmentTime.getTime() - now.getTime()) / 60000,
  );

  /*
   * Appointment already started/passed.
   */

  if (minutesUntilAppointment < 0) {
    return {
      validDateTime: true,

      minutesUntilAppointment,

      canCancel: false,

      hasFee: false,

      fee: 0,

      feeAmountCents: 0,

      isRestricted: true,

      message: "Esta reserva já passou e não pode ser cancelada.",
    };
  }

  /*
   * Less than 4 hours:
   * €2 cancellation fee.
   */

  if (minutesUntilAppointment < 240) {
    return {
      validDateTime: true,

      minutesUntilAppointment,

      canCancel: true,

      hasFee: true,

      fee: 2,

      feeAmountCents: 200,

      isRestricted: true,

      message:
        "Como faltam menos de 4 horas para a marcação, aplica-se uma taxa de cancelamento de 2€.",
    };
  }

  /*
   * 4+ hours:
   * free cancellation.
   */

  return {
    validDateTime: true,

    minutesUntilAppointment,

    canCancel: true,

    hasFee: false,

    fee: 0,

    feeAmountCents: 0,

    isRestricted: false,

    message:
      "Podes cancelar a tua reserva gratuitamente até 4 horas antes da marcação.",
  };
};

// ============================================================
// CHANGE BOOKING POLICY
// ============================================================

const getChangeBookingPolicy = (booking) => {
  const appointmentTime = getBookingDateTime(booking);

  if (!appointmentTime) {
    return {
      validDateTime: false,

      minutesUntilAppointment: null,

      canChange: true,

      hasFee: false,

      fee: 0,

      feeAmountCents: 0,

      isRestricted: false,

      message: "",
    };
  }

  const now = new Date();

  const minutesUntilAppointment = Math.floor(
    (appointmentTime.getTime() - now.getTime()) / 60000,
  );

  /*
   * Appointment already passed.
   */

  if (minutesUntilAppointment < 0) {
    return {
      validDateTime: true,

      minutesUntilAppointment,

      canChange: false,

      hasFee: false,

      fee: 0,

      feeAmountCents: 0,

      isRestricted: true,

      message: "Esta reserva já passou e não pode ser alterada.",
    };
  }

  /*
   * Less than 4 hours:
   * €2 change fee.
   */

  if (minutesUntilAppointment < 240) {
    return {
      validDateTime: true,

      minutesUntilAppointment,

      canChange: true,

      hasFee: true,

      fee: 2,

      feeAmountCents: 200,

      isRestricted: true,

      message:
        "Como faltam menos de 4 horas para a marcação, aplica-se uma taxa de alteração de 2€.",
    };
  }

  return {
    validDateTime: true,

    minutesUntilAppointment,

    canChange: true,

    hasFee: false,

    fee: 0,

    feeAmountCents: 0,

    isRestricted: false,

    message:
      "Podes alterar a tua reserva gratuitamente até 4 horas antes da marcação.",
  };
};

// ============================================================
// BOOKING STATUS HELPERS
// ============================================================

const isBookingActive = (booking) => {
  return Boolean(booking && ACTIVE_BOOKING_STATUSES.includes(booking.status));
};

const isBookingCancelled = (booking) => {
  return booking?.status === "cancelled" || booking?.status === "canceled";
};

const isBookingCompleted = (booking) => {
  return booking?.status === "completed";
};

// ============================================================
// PAYMENT STATUS HELPERS
// ============================================================

const isPaymentAuthorized = (payment) => {
  return payment?.status === "requires_capture";
};

const isPaymentPaid = (payment) => {
  return payment?.status === "paid";
};

const isPaymentRequired = (booking) => {
  return booking?.type === "online";
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // constants
  BOOKING_TYPES,
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUSES,
  PAYMENT_STATUSES,

  // errors
  createValidationError,

  // IDs
  isValidObjectId,
  assertValidObjectId,

  // booking type
  isValidBookingType,
  assertValidBookingType,

  // date
  isValidDateString,
  assertValidDateString,
  getBookingDate,

  // schedule
  getDayName,
  getScheduleForDate,

  // time
  normalizeTime,
  assertValidTime,
  timeToMinutes,
  minutesToTime,

  // breaks
  isTimeInsideBreak,

  // duration / price
  getFinalDuration,
  getValidItemPrice,

  // schedule availability
  validateScheduleAvailability,

  // entities
  assertRestaurantExists,
  assertBarberExists,
  assertItemExists,

  // restaurant / barber
  isBarberRestaurantEmployer,
  assertBarberBelongsToRestaurant,

  // conflicts
  hasBookingConflict,

  // restaurant
  getOwnerRestaurant,
  getStripeAccountId,

  // permissions
  canManageBooking,

  // booking date/time
  getBookingDateTime,

  // policies
  getCancellationPolicy,
  getChangeBookingPolicy,

  // status helpers
  isBookingActive,
  isBookingCancelled,
  isBookingCompleted,

  // payment helpers
  isPaymentAuthorized,
  isPaymentPaid,
  isPaymentRequired,
};
