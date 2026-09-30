const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ============================================================
// BREAK SCHEMA
// ============================================================
// Represents one break period during a working day.
// Example:
//
// {
//   start: "13:00",
//   end: "15:00"
// }
//
// _id is disabled because breaks are embedded settings,
// not independent documents.
// ============================================================

const breakSchema = new mongoose.Schema(
  {
    start: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },

    end: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },
  },
  {
    _id: false,
  },
);

// ============================================================
// DAILY SCHEDULE SCHEMA
// ============================================================
// Represents one day's working schedule.
//
// Example:
//
// {
//   enabled: true,
//   startTime: "10:00",
//   endTime: "19:00",
//   breaks: [
//     {
//       start: "13:00",
//       end: "15:00"
//     }
//   ]
// }
// ============================================================

const dailyScheduleSchema = new mongoose.Schema(
  {
    // ----------------------------------------------------------
    // OPEN / CLOSED
    // ----------------------------------------------------------

    enabled: {
      type: Boolean,
      default: true,
    },

    // ----------------------------------------------------------
    // OPENING TIME
    // ----------------------------------------------------------

    startTime: {
      type: String,
      default: "09:00",
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },

    // ----------------------------------------------------------
    // CLOSING TIME
    // ----------------------------------------------------------

    endTime: {
      type: String,
      default: "18:00",
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },

    // ----------------------------------------------------------
    // BREAKS
    // ----------------------------------------------------------
    // Allows one or multiple breaks per day.
    // ----------------------------------------------------------

    breaks: {
      type: [breakSchema],
      default: [],
    },
  },
  {
    _id: false,
  },
);

const subscriptionSchema = new mongoose.Schema(
  {
    plan: {
      type: String,
      enum: [
        "one-menu",
        "multi-menu",
        "standard-ad",
        "advanced-ad",
        "max-range-ad",
      ],
      required: true,
    },
    billingInterval: {
      type: String,
      enum: ["monthly", "yearly"],
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "eur",
      lowercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["trialing", "active", "past_due", "cancelled", "expired"],
      default: "active",
    },
    startsAt: {
      type: Date,
      required: true,
    },
    endsAt: {
      type: Date,
      required: true,
    },
    autoRenew: {
      type: Boolean,
      default: true,
    },
    paymentMethod: {
      provider: {
        type: String,
        enum: ["stripe", "other"],
        default: "stripe",
      },
      providerPaymentMethodId: String,
      brand: String,
      last4: {
        type: String,
        minlength: 4,
        maxlength: 4,
      },
      expiryMonth: {
        type: Number,
        min: 1,
        max: 12,
      },
      expiryYear: Number,
    },
    providerSubscriptionId: String,
    cancelledAt: Date,
  },
  { timestamps: true },
);

// ============================================================
// USER SCHEMA
// ============================================================

const userSchema = new mongoose.Schema(
  {
    // ==========================================================
    // BASIC INFORMATION
    // ==========================================================

    name: String,

    email: {
      type: String,
      unique: true,
      required: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
    },

    // ==========================================================
    // ROLE
    // ==========================================================

    role: {
      type: String,
      enum: [
        "customer",
        "user",
        "employer",
        "owner",
        "advertisor",
        "Admin",
        "viewer",
        "store",
      ],
      default: "user",
    },

    // ==========================================================
    // MAIN IMAGE
    // ==========================================================

    mainImage: {
      type: String,
    },

    // ==========================================================
    // SUBSCRIPTION PLAN
    // ==========================================================

    subscriptions: {
      type: [subscriptionSchema],
      default: [],
    },

    // Kept for compatibility with existing clients using the old spelling.
    subscriptonPlan: {
      subscription: {
        type: String,
        enum: [
          "one-menu",
          "multi-menu",
          "standard-ad",
          "advanced-ad",
          "max-range-ad",
        ],
        default: "one-menu",
      },
      price: Number,
    },

    // ==========================================================
    // LOYALTY CARDS
    // ==========================================================

    loyaltyCards: [
      {
        restaurant: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Restaurant",
          required: true,
        },
        menuItem: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "MenuItem",
          required: true,
        },
        maxStamps: {
          type: Number,
          default: 10,
          min: 1,
          max: 100,
        },
        stamps: {
          type: Number,
          default: 0,
          min: 0,
          max: 100,
        },

        history: [
          {
            stamps: {
              type: Number,
              required: true,
              min: 0,
              max: 100,
            },

            action: {
              type: String,
              enum: ["added", "removed", "redeemed", "reset"],
              required: true,
            },

            date: {
              type: Date,
              default: Date.now,
            },
          },
        ],
      },
    ],
    available: { type: Boolean, default: true },
    bookings: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Booking",
      },
    ],
    schedule: {
      // --------------------------------------------------------
      // MONDAY
      // --------------------------------------------------------

      monday: {
        type: dailyScheduleSchema,

        default: () => ({
          enabled: true,
          startTime: "09:00",
          endTime: "18:00",
          breaks: [],
        }),
      },

      // --------------------------------------------------------
      // TUESDAY
      // --------------------------------------------------------

      tuesday: {
        type: dailyScheduleSchema,

        default: () => ({
          enabled: true,
          startTime: "09:00",
          endTime: "18:00",
          breaks: [],
        }),
      },

      // --------------------------------------------------------
      // WEDNESDAY
      // --------------------------------------------------------

      wednesday: {
        type: dailyScheduleSchema,

        default: () => ({
          enabled: true,
          startTime: "09:00",
          endTime: "18:00",
          breaks: [],
        }),
      },

      // --------------------------------------------------------
      // THURSDAY
      // --------------------------------------------------------

      thursday: {
        type: dailyScheduleSchema,

        default: () => ({
          enabled: true,
          startTime: "09:00",
          endTime: "18:00",
          breaks: [],
        }),
      },

      // --------------------------------------------------------
      // FRIDAY
      // --------------------------------------------------------

      friday: {
        type: dailyScheduleSchema,

        default: () => ({
          enabled: true,
          startTime: "09:00",
          endTime: "18:00",
          breaks: [],
        }),
      },

      // --------------------------------------------------------
      // SATURDAY
      // --------------------------------------------------------

      saturday: {
        type: dailyScheduleSchema,

        default: () => ({
          enabled: true,
          startTime: "09:00",
          endTime: "18:00",
          breaks: [],
        }),
      },

      // --------------------------------------------------------
      // SUNDAY
      // --------------------------------------------------------

      sunday: {
        type: dailyScheduleSchema,

        default: () => ({
          enabled: false,
          startTime: "09:00",
          endTime: "18:00",
          breaks: [],
        }),
      },
    },
  },
  {
    timestamps: true,
  },
);

/*
|--------------------------------------------------------------------------
| HASH PASSWORD BEFORE SAVE
|--------------------------------------------------------------------------
*/

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
});

/*
|--------------------------------------------------------------------------
| COMPARE PASSWORD METHOD
|--------------------------------------------------------------------------
*/

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

// ============================================================
// EXPORT
// ============================================================

module.exports = mongoose.model("User", userSchema);
