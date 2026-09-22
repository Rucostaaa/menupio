const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema(
  {
    ownID: Number,
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "MenuItem",
      },
    ],
    status: {
      type: String,
      enum: [
        "pending",
        "order-pending",
        "order-accepted",
        "order-initiated",
        "order-completed",
        "invoiced",
      ],
    },
    total: Number,
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Cart", cartSchema);
