const router = require("express").Router();
const auth = require("../middleware/auth");
const BellumMatch = require("../models/BellumMatch");
const User = require("../models/User");

router.get("/bellum-numerus/profile", auth, async (req, res, next) => {
  try {
    const [user, matches] = await Promise.all([
      User.findById(req.user._id)
        .select("games.bellumNumerus games.mixedMathQuiz games.wordSearch")
        .lean(),
      BellumMatch.find({ "players.user": req.user._id })
        .sort({ finishedAt: -1 })
        .limit(10)
        .populate("winner", "name")
        .populate("players.user", "name")
        .lean(),
    ]);

    return res.json({
      success: true,
      profile: user?.games?.bellumNumerus || {
        matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        trophies: [],
      },
      mixedMathQuiz: user?.games?.mixedMathQuiz || {
        played: 0,
        bestScore: 0,
        questionsAnswered: 0,
        correctAnswers: 0,
      },
      wordSearch: user?.games?.wordSearch || {
        played: 0,
        bestScore: 0,
      },
      matches,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
