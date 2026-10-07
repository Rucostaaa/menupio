const mongoose = require("mongoose");

const roundSchema = new mongoose.Schema(
  {
    roundNumber: { type: Number, required: true },
    target: { type: Number, required: true },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    winnerIsBot: { type: Boolean, default: false },
    winnerName: { type: String, default: "" },
    result: {
      type: String,
      enum: ["solved", "incorrect", "timeout"],
      required: true,
    },
    damage: { type: Number, default: 0 },
    elapsedMs: { type: Number, default: 0 },
  },
  { _id: false },
);

const bellumMatchSchema = new mongoose.Schema(
  {
    matchId: { type: String, required: true, unique: true },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      required: true,
    },
    players: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        name: { type: String, required: true },
        isBot: { type: Boolean, default: false },
        score: { type: Number, default: 0 },
        remainingHealth: { type: Number, default: 0 },
      },
    ],
    winner: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    result: {
      type: String,
      enum: ["win", "draw", "forfeit"],
      required: true,
    },
    rounds: { type: [roundSchema], default: [] },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

bellumMatchSchema.index({ "players.user": 1, finishedAt: -1 });

module.exports = mongoose.model("BellumMatch", bellumMatchSchema);
