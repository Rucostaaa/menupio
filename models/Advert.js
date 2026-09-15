const mongoose = require("mongoose");

const advertSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    image: { type: String },
    geoPoint: {
      lat: Number,
      lng: Number,
      address: String,
      radius: Number,
    },

    clicks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Session",
      },
    ],
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Advert", advertSchema);
