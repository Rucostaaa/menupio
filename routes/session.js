const express = require("express");

const {
  heartbeat,
  getActiveSessions,
  endSession,
  identifySession,
  trackProductClick,
  getSessionsByScreen,
} = require("../controllers/session");

const auth = require("../middleware/auth");

const router = express.Router();

router.post("/heartbeat", heartbeat);

router.post("/product-click", trackProductClick);

router.post("/identify", auth, identifySession);

router.get("/by-screen/:screenId", auth, getSessionsByScreen);
router.get("/active", auth, getActiveSessions);

router.post("/end", endSession);

module.exports = router;
