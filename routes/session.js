const express = require("express");

const {
  heartbeat,
  getActiveSessions,
  endSession,
  identifySession,
  trackProductClick,
  getSessionsByScreen,
  getSessionHistory,
} = require("../controllers/session");

const auth = require("../middleware/auth");
const allowedRoles = require("../middleware/allowedRoles");

const router = express.Router();

router.post("/heartbeat", heartbeat);

router.post("/product-click", trackProductClick);

router.post("/identify", auth, identifySession);

router.get("/by-screen/:screenId", auth, getSessionsByScreen);
router.get("/active", auth, getActiveSessions);
router.get("/history", auth, allowedRoles(["Admin"]), getSessionHistory);

router.post("/end", endSession);

module.exports = router;

