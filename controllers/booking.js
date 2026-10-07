// controllers/booking.js

const Booking = require("../models/Booking");

const {
  isValidObjectId,
  isValidBookingType,
  canManageBooking,
  getStripeAccountId,
  getCancellationPolicy,
  getChangeBookingPolicy,
} = require("../middleware/validation");

const {
  prepareBookingData,
  createBookingPaymentIntent,
  getBookingPaymentIntent,
  updateBookingPaymentFromIntent,
  captureBookingPayment: capturePayment,
  cancelBookingPaymentAuthorization,
  createCancellationFeePayment,

  getPopulatedBooking,
  getAvailableSlots,

  getBookingsForBarber,
  getBookingsForRestaurant,
  getBookingById,
  getBookingsForUser,
  populateBooking,

  prepareBookingUpdate,
  claimBookingForUser,

  sendBookingResponse,
  sendBookingError,
} = require("../middleware/helpers");

const { sendBookingConfirmationEmail } = require("../utils/twilioEmail");

const rejectMenuOrderAction = (res, booking) => {
  if (booking?.kind !== "order") {
    return false;
  }

  res.status(409).json({
    success: false,
    message: "This booking action is not available for menu orders.",
  });
  return true;
};

/* =========================================================
   CREATE BOOKING
========================================================= */
const createBooking = async (req, res) => {
  let booking = null;

  try {
    const {
      restaurant: restaurantId,
      barber: barberId,
      item: itemId,
      type = "online",
      customer,
      customerDetails,
      date,
      time,
      duration = 30,
      notes,
    } = req.body || {};

    /* =====================================================
       VALIDATE BOOKING TYPE
    ===================================================== */

    if (!isValidBookingType(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking type.",
      });
    }

    /* =====================================================
       PREPARE / VALIDATE BOOKING DATA
    ===================================================== */

    const prepared = await prepareBookingData({
      restaurantId,
      barberId,
      itemId,
      date,
      time,
      duration,
    });

    const {
      restaurant,
      barber,
      item,
      normalizedTime,
      finalDuration,
      itemPrice,
    } = prepared;

    /* =====================================================
       ONLINE BOOKING
    ===================================================== */

    if (type === "online") {
      /* ---------------------------------------------------
         CUSTOMER VALIDATION
      --------------------------------------------------- */

      if (
        !customer ||
        typeof customer.name !== "string" ||
        !customer.name.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Customer name is required.",
        });
      }

      if (
        !customer.email ||
        typeof customer.email !== "string" ||
        !customer.email.trim()
      ) {
        return res.status(400).json({
          success: false,
          message: "Customer email is required.",
        });
      }

      /* ---------------------------------------------------
         CHECK IF THIS RESTAURANT REQUIRES ONLINE PAYMENT
      --------------------------------------------------- */

      const paymentEnabled = restaurant.paymentEnabled === true;

      /* ===================================================
         ONLINE BOOKING WITHOUT PAYMENT
         
         Restaurant has:
           paymentEnabled === false

         Therefore:
           - no Stripe
           - no PaymentIntent
           - booking goes directly into DB
           - payment is not required
      =================================================== */

      if (!paymentEnabled) {
        booking = await Booking.create({
          restaurant: restaurant._id,

          barber: barber._id,

          item: item._id,

          type: "online",

          customer: {
            name: customer.name.trim(),

            phone: String(customer.phone || "").trim(),

            email: customer.email.trim().toLowerCase(),
          },

          customerDetails: null,

          date,

          time: normalizedTime,

          duration: finalDuration,

          price: itemPrice,

          /*
           * No payment is required for this restaurant.
           *
           * The booking can go directly through.
           */
          status: "confirmed",

          notes: String(notes || "").trim(),

          payment: {
            status: "not_required",

            stripePaymentIntentId: null,

            amount: 0,

            stripeAccountId: null,

            currency: "eur",

            paidAt: null,
          },
        });

        return res.status(201).json({
          success: true,

          message: "Booking created successfully.",

          booking,

          bookingId: booking._id,

          /*
           * Explicit flags for the frontend.
           */
          paymentRequired: false,

          paymentEnabled: false,

          bookingStatus: booking.status,

          paymentStatus: booking.payment.status,
        });
      }

      /* ===================================================
         ONLINE BOOKING WITH PAYMENT
         
         Restaurant has:
           paymentEnabled === true

         Therefore:
           - Stripe is required
           - PaymentIntent is created
           - booking initially pending
      =================================================== */

      const stripeAccountId = getStripeAccountId(restaurant);

      if (!stripeAccountId) {
        return res.status(400).json({
          success: false,
          message:
            "Online payments are enabled for this restaurant, but Stripe is not configured.",
        });
      }

      /* ---------------------------------------------------
         CREATE BOOKING
      --------------------------------------------------- */

      booking = new Booking({
        restaurant: restaurant._id,

        barber: barber._id,

        item: item._id,

        type: "online",

        customer: {
          name: customer.name.trim(),

          phone: String(customer.phone || "").trim(),

          email: customer.email.trim().toLowerCase(),
        },

        customerDetails: null,

        date,

        time: normalizedTime,

        duration: finalDuration,

        price: itemPrice,

        /*
         * BOOKING STATUS
         *
         * Payment still needs to be authorized.
         */
        status: "pending",

        notes: String(notes || "").trim(),

        /*
         * PAYMENT STATUS
         */
        payment: {
          status: "pending",

          stripePaymentIntentId: null,

          amount: Math.round(itemPrice * 100),

          stripeAccountId,

          currency: "eur",

          paidAt: null,
        },
      });

      await booking.save();

      /* ---------------------------------------------------
         CREATE STRIPE PAYMENT INTENT
      --------------------------------------------------- */

      try {
        const paymentIntent = await createBookingPaymentIntent(
          booking,
          stripeAccountId,
        );

        /* -------------------------------------------------
           SAVE STRIPE PAYMENT INTENT
        ------------------------------------------------- */

        booking.payment.stripePaymentIntentId = paymentIntent.id;

        /* -------------------------------------------------
           SYNCHRONIZE PAYMENT STATUS
        ------------------------------------------------- */

        if (paymentIntent.status === "requires_capture") {
          booking.payment.status = "requires_capture";
        } else if (paymentIntent.status === "succeeded") {
          /*
           * This normally should not happen with your
           * manual-capture PaymentIntent flow.
           *
           * But if Stripe returns succeeded, keep DB
           * consistent.
           */
          booking.payment.status = "paid";

          if (!booking.payment.paidAt) {
            booking.payment.paidAt = new Date();
          }
        } else if (
          paymentIntent.status === "requires_payment_method" ||
          paymentIntent.status === "requires_confirmation" ||
          paymentIntent.status === "requires_action"
        ) {
          booking.payment.status = "pending";
        } else if (
          paymentIntent.status === "canceled" ||
          paymentIntent.status === "cancelled"
        ) {
          booking.payment.status = "cancelled";
        } else {
          booking.payment.status = "pending";
        }

        await booking.save();

        /* -------------------------------------------------
           RESPONSE
        ------------------------------------------------- */

        return res.status(201).json({
          success: true,

          message: "Booking created and payment initialized.",

          booking,

          bookingId: booking._id,

          /*
           * Frontend uses this to know that Stripe UI
           * needs to be displayed.
           */
          paymentRequired: true,

          paymentEnabled: true,

          clientSecret: paymentIntent.client_secret,

          paymentIntentId: paymentIntent.id,

          paymentIntentStatus: paymentIntent.status,

          paymentStatus: booking.payment.status,

          bookingStatus: booking.status,
        });
      } catch (stripeError) {
        /*
         * Stripe PaymentIntent failed.
         *
         * Remove the booking so we don't leave an
         * unusable pending booking in the database.
         */
        await Booking.findByIdAndDelete(booking._id);

        throw stripeError;
      }
    }

    /* =====================================================
       WALK-IN BOOKING
    ===================================================== */

    if (
      !customerDetails ||
      typeof customerDetails.name !== "string" ||
      !customerDetails.name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Walk-in customer name is required.",
      });
    }

    /* -----------------------------------------------------
       WALK-IN BOOKINGS DO NOT REQUIRE STRIPE
    ----------------------------------------------------- */

    booking = await Booking.create({
      restaurant: restaurant._id,

      barber: barber._id,

      item: item._id,

      type: "walkin",

      customer: null,

      customerDetails: {
        name: customerDetails.name.trim(),

        phone: String(customerDetails.phone || "").trim(),

        email: String(customerDetails.email || "")
          .trim()
          .toLowerCase(),
      },

      date,

      time: normalizedTime,

      duration: finalDuration,

      price: itemPrice,

      /*
       * Walk-in bookings are immediately confirmed.
       */
      status: "confirmed",

      notes: String(notes || "").trim(),

      /*
       * No Stripe payment.
       */
      payment: {
        status: "not_required",

        stripePaymentIntentId: null,

        amount: 0,

        stripeAccountId: null,

        currency: "eur",

        paidAt: null,
      },
    });

    return res.status(201).json({
      success: true,

      message: "Walk-in booking created.",

      booking,

      bookingId: booking._id,

      paymentRequired: false,

      paymentEnabled: false,

      bookingStatus: booking.status,

      paymentStatus: booking.payment.status,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to create booking.");
  }
};

/* =========================================================
   GET BOOKING
========================================================= */

const getBooking = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const booking = await getPopulatedBooking(id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const publicBooking =
      booking.kind === "order"
        ? {
            ...booking.toObject(),
            customer: { name: booking.customer?.name || "" },
          }
        : booking;

    return res.status(200).json({
      success: true,
      booking: publicBooking,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to get booking.");
  }
};

/* =========================================================
   GET AVAILABILITY
========================================================= */

const getAvailability = async (req, res) => {
  try {
    const { barberId } = req.params;
    const { date, duration = 30 } = req.query;

    const availability = await getAvailableSlots({
      barberId,
      date,
      duration,
    });

    return res.status(200).json({
      success: true,
      ...availability,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to get availability.");
  }
};

/* =========================================================
   UPDATE BOOKING
========================================================= */

const updateBooking = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const booking = await getBookingById(id);
    if (rejectMenuOrderAction(res, booking)) return;

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const allowed = await canManageBooking(req, booking);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to update this booking.",
      });
    }

    if (booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cancelled bookings cannot be updated.",
      });
    }

    if (booking.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Completed bookings cannot be updated.",
      });
    }

    const requestedChange = req.body || {};

    const isChangingAppointment =
      requestedChange.date !== undefined ||
      requestedChange.time !== undefined ||
      requestedChange.duration !== undefined ||
      requestedChange.barberId !== undefined;

    if (isChangingAppointment) {
      const policy = getChangeBookingPolicy(booking);

      if (!policy.canChange) {
        return res.status(400).json({
          success: false,
          message: policy.message || "This booking can no longer be changed.",
        });
      }
    }

    const prepared = await prepareBookingUpdate({
      booking,
      updates: requestedChange,
    });

    booking.barber = prepared.barber._id;
    booking.date = prepared.date;
    booking.time = prepared.time;
    booking.duration = prepared.duration;

    if (requestedChange.notes !== undefined) {
      booking.notes = String(requestedChange.notes || "").trim();
    }

    if (requestedChange.status !== undefined) {
      const allowedStatuses = [
        "pending",
        "confirmed",
        "completed",
        "no_show",
        "cancelled",
      ];

      if (!allowedStatuses.includes(requestedChange.status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking status.",
        });
      }

      if (
        requestedChange.status === "confirmed" &&
        booking.type === "online" &&
        booking.payment?.status !== "paid"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "An online booking cannot be confirmed before payment is captured.",
        });
      }

      booking.status = requestedChange.status;
    }

    if (requestedChange.cancellationReason !== undefined) {
      booking.cancellationReason = String(
        requestedChange.cancellationReason || "",
      ).trim();
    }

    await booking.save();

    const updatedBooking = await getPopulatedBooking(booking._id);

    return res.status(200).json({
      success: true,
      message: "Booking updated.",
      booking: updatedBooking,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to update booking.");
  }
};

/* =========================================================
   CANCEL BOOKING
========================================================= */

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = "" } = req.body || {};

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const booking = await getBookingById(id);
    if (rejectMenuOrderAction(res, booking)) return;

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const allowed = await canManageBooking(req, booking);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to cancel this booking.",
      });
    }

    if (booking.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Completed bookings cannot be cancelled.",
      });
    }

    if (booking.status === "cancelled") {
      return res.status(200).json({
        success: true,
        message: "Booking is already cancelled.",
        booking,
      });
    }

    const policy = getCancellationPolicy(booking);

    if (!policy.canCancel) {
      return res.status(400).json({
        success: false,
        message: policy.message || "This booking cannot be cancelled.",
      });
    }

    /* =====================================================
       ONLINE PAYMENT
    ===================================================== */

    if (booking.type === "online" && booking.payment?.stripePaymentIntentId) {
      const { paymentIntent } = await getBookingPaymentIntent(booking);

      /*
       * Authorization has not been captured.
       * Cancel the authorization.
       */
      if (paymentIntent.status === "requires_capture") {
        await cancelBookingPaymentAuthorization(booking);
      }

      /*
       * Already captured.
       * Do not silently mark refunded.
       */
      if (paymentIntent.status === "succeeded") {
        return res.status(409).json({
          success: false,
          message:
            "This booking payment has already been captured and requires a refund flow.",
        });
      }

      /*
       * Cancellation fee under 4 hours.
       */
      if (policy.hasFee && paymentIntent.payment_method) {
        const feePaymentIntent = await createCancellationFeePayment({
          booking,
          originalPaymentIntent: paymentIntent,
        });

        booking.cancellationFee = {
          amount: 2,
          currency: paymentIntent.currency || "eur",
          charged: feePaymentIntent.status === "succeeded",
          stripePaymentIntentId: feePaymentIntent.id,
          chargedAt:
            feePaymentIntent.status === "succeeded" ? new Date() : null,
        };
      }
    }

    booking.status = "cancelled";
    booking.cancelledAt = new Date();
    booking.cancellationReason = String(reason || "").trim();

    await booking.save();

    const cancelledBooking = await getPopulatedBooking(booking._id);

    return res.status(200).json({
      success: true,
      message: policy.hasFee
        ? "Booking cancelled. A €2 cancellation fee applies."
        : "Booking cancelled.",
      booking: cancelledBooking,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to cancel booking.");
  }
};

/* =========================================================
   CONFIRM BOOKING
========================================================= */

const confirmBooking = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const booking = await getBookingById(id);
    if (rejectMenuOrderAction(res, booking)) return;

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const allowed = await canManageBooking(req, booking);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to confirm this booking.",
      });
    }

    if (booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cancelled bookings cannot be confirmed.",
      });
    }

    if (booking.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Completed bookings cannot be confirmed.",
      });
    }

    if (booking.type === "online" && booking.payment?.status !== "paid") {
      return res.status(400).json({
        success: false,
        message:
          "Online booking can only be confirmed after successful payment capture.",
      });
    }

    booking.status = "confirmed";

    await booking.save();

    const confirmedBooking = await getPopulatedBooking(booking._id);

    return res.status(200).json({
      success: true,
      message: "Booking confirmed.",
      booking: confirmedBooking,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to confirm booking.");
  }
};

/* =========================================================
   COMPLETE BOOKING
========================================================= */

const completeBooking = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const booking = await getBookingById(id);
    if (rejectMenuOrderAction(res, booking)) return;

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const allowed = await canManageBooking(req, booking);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to complete this booking.",
      });
    }

    if (booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cancelled bookings cannot be completed.",
      });
    }

    if (booking.status === "completed") {
      return res.status(200).json({
        success: true,
        message: "Booking is already completed.",
        booking,
      });
    }

    /*
     * Capture online payment when service
     * has been completed.
     */
    if (booking.type === "online" && booking.payment?.stripePaymentIntentId) {
      await capturePayment(booking);
    }

    booking.status = "completed";

    await booking.save();

    const completedBooking = await getPopulatedBooking(booking._id);

    return res.status(200).json({
      success: true,
      message: "Booking completed.",
      booking: completedBooking,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to complete booking.");
  }
};

/* =========================================================
   CAPTURE BOOKING PAYMENT
========================================================= */

const captureBookingPayment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const booking = await getBookingById(id);
    if (rejectMenuOrderAction(res, booking)) return;

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const allowed = await canManageBooking(req, booking);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to capture this payment.",
      });
    }

    if (booking.type !== "online") {
      return res.status(400).json({
        success: false,
        message: "Only online bookings have Stripe payments.",
      });
    }

    const result = await capturePayment(booking);

    const updatedBooking = await getPopulatedBooking(booking._id);

    return res.status(200).json({
      success: true,
      message: result.alreadyCaptured
        ? "Payment was already captured."
        : "Payment captured successfully.",
      booking: updatedBooking,
      paymentIntent: result.paymentIntent,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to capture booking payment.");
  }
};

/* =========================================================
   RETRY CAPTURE PAYMENT
========================================================= */

const retryCaptureBookingPayment = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const booking = await getBookingById(id);
    if (rejectMenuOrderAction(res, booking)) return;

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const allowed = await canManageBooking(req, booking);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to retry this payment.",
      });
    }

    if (booking.type !== "online") {
      return res.status(400).json({
        success: false,
        message: "Only online bookings have Stripe payments.",
      });
    }

    if (booking.payment?.status === "paid") {
      return res.status(200).json({
        success: true,
        message: "Booking payment is already paid.",
        booking,
      });
    }

    const result = await capturePayment(booking);

    const updatedBooking = await getPopulatedBooking(booking._id);

    return res.status(200).json({
      success: true,
      message: "Booking payment captured successfully.",
      booking: updatedBooking,
      paymentIntent: result.paymentIntent,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to retry booking payment.");
  }
};

/* =========================================================
   UPDATE PAYMENT
========================================================= */

const updateBookingPayment = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { paymentIntentId } = req.body || {};

    if (!isValidObjectId(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    if (!paymentIntentId || typeof paymentIntentId !== "string") {
      return res.status(400).json({
        success: false,
        message: "PaymentIntent ID is required.",
      });
    }

    const booking = await getBookingById(bookingId);
    if (rejectMenuOrderAction(res, booking)) return;

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    if (
      booking.payment?.stripePaymentIntentId &&
      booking.payment.stripePaymentIntentId !== paymentIntentId
    ) {
      return res.status(409).json({
        success: false,
        message: "PaymentIntent does not belong to this booking.",
      });
    }

    const { connectedStripe } = await getBookingPaymentIntent(booking);

    const paymentIntent =
      await connectedStripe.paymentIntents.retrieve(paymentIntentId);

    if (
      paymentIntent.metadata?.bookingId &&
      paymentIntent.metadata.bookingId !== String(booking._id)
    ) {
      return res.status(409).json({
        success: false,
        message: "PaymentIntent does not belong to this booking.",
      });
    }

    if (paymentIntent.capture_method !== "manual") {
      return res.status(409).json({
        success: false,
        message: "This booking payment is not configured for manual capture.",
      });
    }

    updateBookingPaymentFromIntent(booking, paymentIntent);

    await booking.save();

    const updatedBooking = await getPopulatedBooking(booking._id);

    return res.status(200).json({
      success: true,
      message:
        paymentIntent.status === "requires_capture"
          ? "Payment authorized."
          : paymentIntent.status === "succeeded"
            ? "Payment captured."
            : "Payment status updated.",
      booking: updatedBooking,
      paymentIntent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        capture_method: paymentIntent.capture_method,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      },
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to update booking payment.");
  }
};

/* =========================================================
   SEND BOOKING EMAIL
========================================================= */

const sendBookingEmail = async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!isValidObjectId(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const booking = await getBookingById(bookingId);
    if (rejectMenuOrderAction(res, booking)) return;

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    if (booking.type === "online" && booking.payment?.stripePaymentIntentId) {
      const { paymentIntent } = await getBookingPaymentIntent(booking);

      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({
          success: false,
          message: "Booking payment has not been captured yet.",
        });
      }
    }

    await sendBookingConfirmationEmail(booking);

    return res.status(200).json({
      success: true,
      message: "Booking confirmation email sent.",
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to send booking email.");
  }
};

/* =========================================================
   CLAIM BOOKING
========================================================= */

const claimBooking = async (req, res) => {
  try {
    const { id } = req.params;

    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const booking = await getBookingById(id);
    if (rejectMenuOrderAction(res, booking)) return;

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const claimedBooking = await claimBookingForUser({
      booking,
      userId,
    });

    return res.status(200).json({
      success: true,
      message: "Reserva associada à tua conta com sucesso.",
      booking: claimedBooking,
    });
  } catch (error) {
    return sendBookingError(
      res,
      error,
      "Não foi possível associar a reserva à tua conta.",
    );
  }
};

/* =========================================================
   USER BOOKINGS
========================================================= */

const getUserBookings = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const bookings = await getBookingsForUser(userId);

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to get user bookings.");
  }
};

/* =========================================================
   CUSTOMER BOOKINGS
========================================================= */

const getCustomerBookings = async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!isValidObjectId(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID.",
      });
    }

    const bookings = await getBookingsForUser(customerId);

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to get customer bookings.");
  }
};

/* =========================================================
   BARBER BOOKINGS
========================================================= */

const getBarberBookings = async (req, res) => {
  try {
    const { barberId } = req.params;

    if (!isValidObjectId(barberId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid barber ID.",
      });
    }

    const { date, startDate, endDate, status } = req.query;

    const bookings = await getBookingsForBarber({
      barberId,
      date,
      startDate,
      endDate,
      status,
    });

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to get barber bookings.");
  }
};

/* =========================================================
   RESTAURANT BOOKINGS
========================================================= */

const getRestaurantBookings = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    if (!isValidObjectId(restaurantId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid restaurant ID.",
      });
    }

    const { date, startDate, endDate, status } = req.query;

    const bookings = await getBookingsForRestaurant({
      restaurantId,
      date,
      startDate,
      endDate,
      status,
    });

    return res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to get restaurant bookings.");
  }
};

/* =========================================================
   MARK NO-SHOW
========================================================= */

const markNoShow = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const booking = await getBookingById(id);
    if (rejectMenuOrderAction(res, booking)) return;

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const allowed = await canManageBooking(req, booking);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to mark this booking as no-show.",
      });
    }

    if (booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cancelled bookings cannot be marked as no-show.",
      });
    }

    if (booking.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Completed bookings cannot be marked as no-show.",
      });
    }

    if (booking.status === "no_show") {
      return res.status(200).json({
        success: true,
        message: "Booking is already marked as no-show.",
        booking,
      });
    }

    booking.status = "no_show";

    await booking.save();

    const updatedBooking = await getPopulatedBooking(booking._id);

    return res.status(200).json({
      success: true,
      message: "Booking marked as no-show.",
      booking: updatedBooking,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to mark booking as no-show.");
  }
};

/* =========================================================
   DELETE BOOKING
========================================================= */

const deleteBooking = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const booking = await getBookingById(id);
    if (rejectMenuOrderAction(res, booking)) return;

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const allowed = await canManageBooking(req, booking);

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this booking.",
      });
    }

    if (booking.status === "pending" || booking.status === "confirmed") {
      return res.status(400).json({
        success: false,
        message: "Active bookings cannot be deleted. Cancel the booking first.",
      });
    }

    if (booking.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Completed bookings cannot be deleted.",
      });
    }

    await booking.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Booking deleted successfully.",
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to delete booking.");
  }
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  createBooking,
  getBooking,

  getAvailability,

  updateBooking,
  cancelBooking,
  confirmBooking,
  completeBooking,

  captureBookingPayment,
  retryCaptureBookingPayment,
  updateBookingPayment,

  sendBookingEmail,
  claimBooking,

  getUserBookings,
  getCustomerBookings,
  getBarberBookings,
  getRestaurantBookings,

  markNoShow,
  deleteBooking,
};
