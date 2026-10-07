const router = require("express").Router();
const auth = require("../middleware/auth");
const allowedRoles = require("../middleware/allowedRoles");
const {
  cancelCurrent,
  createCheckout,
  getCurrent,
  getAccess,
  getPlans,
  upgradePlan,
} = require("../controllers/restaurantSubscriptions");

router.use(auth, allowedRoles(["owner", "store"]));
router.get("/access", getAccess);
router.get("/plans", getPlans);
router.get("/current", getCurrent);
router.post("/checkout", createCheckout);
router.post("/upgrade", upgradePlan);
router.post("/cancel", cancelCurrent);

module.exports = router;
