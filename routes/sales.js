const router = require("express").Router();
const auth = require("../middleware/auth");
const allowedRoles = require("../middleware/allowedRoles");
const {
  getDashboard,
  getUnreadLeadCount,
  createAdvertiserInquiry,
  getLeads,
  createLead,
  getLead,
  markLeadRead,
  deleteLead,
  updateLead,
  updateLeadStatus,
  addLeadActivity,
  updateLeadFollowUp,
} = require("../controllers/sales");

router.post("/advertiser-inquiries", createAdvertiserInquiry);
router.use(auth, allowedRoles(["Admin"]));

router.get("/dashboard", getDashboard);
router.get("/leads/unread-count", getUnreadLeadCount);
router.route("/leads").get(getLeads).post(createLead);
router.get("/leads/:id", getLead);
router.patch("/leads/:id/read", markLeadRead);
router.delete("/leads/:id", deleteLead);
router.patch("/leads/:id", updateLead);
router.patch("/leads/:id/status", updateLeadStatus);
router.post("/leads/:id/activities", addLeadActivity);
router.patch("/leads/:id/follow-up", updateLeadFollowUp);

module.exports = router;
