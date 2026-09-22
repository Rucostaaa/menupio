const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
  },
  {
    _id: false,
  },
);

const paymentSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        "not_required",
        "requires_capture",
        "pending",
        "processing",
        "paid",
        "failed",
        "refunded",
        "cancelled",
      ],
      default: "not_required",
    },

    stripePaymentIntentId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    stripeAccountId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },

    amount: {
      type: Number,
      min: [0, "Payment amount cannot be negative"],
      default: 0,
    },

    currency: {
      type: String,
      trim: true,
      lowercase: true,
      default: "eur",
    },

    paidAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  },
);

const bookingSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: [true, "Restaurant is required"],
      index: true,
    },

    barber: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Barber is required"],
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    type: {
      type: String,
      enum: ["online", "walkin"],
      required: true,
      default: "online",
      index: true,
    },

    customer: {
      type: customerSchema,

      required: function () {
        return this.type === "online";
      },

      default: null,
    },
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
    },

    customerDetails: {
      type: customerSchema,

      required: function () {
        return this.type === "walkin";
      },

      default: null,
    },

    date: {
      type: String,
      required: [true, "Booking date is required"],
      match: [/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format"],
      index: true,
    },

    time: {
      type: String,
      required: [true, "Booking time is required"],
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must use HH:mm format"],
      index: true,
    },

    duration: {
      type: Number,
      required: [true, "Booking duration is required"],
      min: [1, "Duration must be greater than 0"],
    },

    price: {
      type: Number,
      required: [true, "Booking price is required"],
      min: [0, "Price cannot be negative"],
    },

    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed", "no_show"],
      default: "pending",
      index: true,
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    payment: {
      type: paymentSchema,

      default: () => ({
        status: "not_required",
        stripePaymentIntentId: null,
        stripeAccountId: null,
        amount: 0,
        currency: "eur",
        paidAt: null,
      }),
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      trim: true,
      default: "",
    },
  },

  {
    timestamps: true,
  },
);

/*
|--------------------------------------------------------------------------
| INDEXES
|--------------------------------------------------------------------------
*/

bookingSchema.index({
  barber: 1,
  date: 1,
});

bookingSchema.index({
  barber: 1,
  date: 1,
  time: 1,
  status: 1,
});

bookingSchema.index({
  barber: 1,
  date: 1,
  status: 1,
});

bookingSchema.index({
  "payment.stripePaymentIntentId": 1,
});

bookingSchema.index({
  "payment.stripeAccountId": 1,
});

/*
|--------------------------------------------------------------------------
| VALIDATION
|--------------------------------------------------------------------------
*/

bookingSchema.pre("validate", function () {
  /*
  |--------------------------------------------------------------------------
  | GENERAL VALIDATION
  |--------------------------------------------------------------------------
  */

  if (!Number.isFinite(this.duration) || this.duration <= 0) {
    throw new Error("Booking duration must be greater than 0");
  }

  if (!Number.isFinite(this.price) || this.price < 0) {
    throw new Error("Booking price cannot be negative");
  }

  /*
  |--------------------------------------------------------------------------
  | ONLINE BOOKING
  |--------------------------------------------------------------------------
  */

  if (this.type === "online") {
    if (
      !this.customer ||
      typeof this.customer.name !== "string" ||
      !this.customer.name.trim()
    ) {
      throw new Error("Online bookings require customer information");
    }

    /*
     * Make sure payment object exists.
     */

    if (!this.payment) {
      this.payment = {
        status: "pending",
        stripePaymentIntentId: null,
        stripeAccountId: null,
        amount: Math.round(this.price * 100),
        currency: "eur",
        paidAt: null,
      };
    }

    /*
     * Make sure currency exists.
     */

    if (!this.payment.currency) {
      this.payment.currency = "eur";
    }

    /*
     * Make sure payment amount exists.
     */

    if (!Number.isFinite(this.payment.amount) || this.payment.amount < 0) {
      this.payment.amount = Math.round(this.price * 100);
    }

    /*
     * Make sure payment status exists.
     */

    if (!this.payment.status) {
      this.payment.status = "pending";
    }

    /*
     * stripeAccountId is allowed to remain null.
     *
     * It should be populated when the Stripe PaymentIntent
     * is created on a connected account.
     */

    if (typeof this.payment.stripeAccountId === "undefined") {
      this.payment.stripeAccountId = null;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | WALK-IN BOOKING
  |--------------------------------------------------------------------------
  */

  if (this.type === "walkin") {
    if (
      !this.customerDetails ||
      typeof this.customerDetails.name !== "string" ||
      !this.customerDetails.name.trim()
    ) {
      throw new Error("Walk-in bookings require customer details");
    }

    /*
     * Walk-in bookings are automatically confirmed.
     */

    this.status = "confirmed";

    /*
     * Walk-in bookings do not require Stripe.
     */

    this.payment = {
      status: "not_required",
      stripePaymentIntentId: null,
      stripeAccountId: null,
      amount: 0,
      currency: "eur",
      paidAt: null,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | CANCELLATION
  |--------------------------------------------------------------------------
  */

  if (this.status === "cancelled" && !this.cancelledAt) {
    this.cancelledAt = new Date();
  }

  if (this.status !== "cancelled") {
    this.cancelledAt = null;

    if (typeof this.cancellationReason !== "string") {
      this.cancellationReason = "";
    }
  }
});

/*
|--------------------------------------------------------------------------
| MODEL
|--------------------------------------------------------------------------
*/

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
