const router = require("express").Router();
const auth = require("../middleware/auth");
const allowedRoles = require("../middleware/allowedRoles");
const {
  acceptInvitation,
  createAdminInvitation,
  createEmployerInvitation,
  getInvitation,
} = require("../controllers/invitation");

router.post("/admin", auth, allowedRoles(["Admin"]), createAdminInvitation);
router.post(
  "/restaurants/:restaurantId/employers",
  auth,
  allowedRoles(["store", "owner"]),
  createEmployerInvitation,
);
router.get("/accept/:token", getInvitation);
router.post("/accept/:token", acceptInvitation);

module.exports = router;
