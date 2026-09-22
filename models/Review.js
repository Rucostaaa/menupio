const mongoose = require("mongoose");

const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    booking: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
      index: true,
    },

    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    restaurant: {
      type: Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },

    barber: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    ratings: {
      app: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
      },

      employee: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
      },

      space: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
      },

      overall: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
      },
    },

    comment: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    improvement: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

/*
 * Useful indexes for dashboard/reporting.
 */
reviewSchema.index({
  restaurant: 1,
  createdAt: -1,
});

reviewSchema.index({
  barber: 1,
  createdAt: -1,
});

reviewSchema.index({
  user: 1,
  createdAt: -1,
});

const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;
