const router = require("express").Router();
const {
  archivePlan,
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  updatePlan,
  updatePlanStatus,
} = require("../controllers/subscriptionPlans");

router.route("/").get(listPlans).post(createPlan);
router.route("/:id").get(getPlan).put(updatePlan).delete(archivePlan);
router.patch("/:id/status", updatePlanStatus);
router.delete("/:id/permanent", deletePlan);

module.exports = router;
