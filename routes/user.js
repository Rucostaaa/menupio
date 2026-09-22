const router = require("express").Router();

const {
  updateUserSchedule,
  updateProfile,
  updatePassword,
} = require("../controllers/user");
const {
  listSubscriptions,
  getSubscription,
  createSubscription,
  updateSubscription,
  deleteSubscription,
} = require("../controllers/subscription");
const auth = require("../middleware/auth");

router.patch("/schedule/:id", updateUserSchedule);
router.patch("/profile", auth, updateProfile);
router.patch("/password", auth, updatePassword);

router
  .route("/subscriptions")
  .get(auth, listSubscriptions)
  .post(auth, createSubscription);

router
  .route("/subscriptions/:subscriptionId")
  .get(auth, getSubscription)
  .patch(auth, updateSubscription)
  .delete(auth, deleteSubscription);

module.exports = router;
