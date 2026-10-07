const mongoose = require("mongoose");

const imageSchema = new mongoose.Schema(
  {
    flyer: [
      {
        image: String,
        publicId: {
          type: String,
          trim: true,
        },

        imageSettings: {
          h: { type: String, default: "105%" },
          w: { type: String, default: "105%" },
          translateX: { type: String, default: "14%" },
          translateY: { type: String, default: "2%" },
          rotate: { type: String, default: "0deg" },
          zIndex: { type: Number, default: 1 },
          opacity: { type: Number, default: 1 },
        },
      },
    ],
    background: String,
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Image", imageSchema);
