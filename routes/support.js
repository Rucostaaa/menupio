const router = require("express").Router();
const auth = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const {
  createTicket,
  getTicketMessages,
  getAdminTickets,
  getMyTickets,
  updateTicketStatus,
} = require("../controllers/support");

router.post("/tickets", optionalAuth, createTicket);
router.get("/tickets/admin", auth, getAdminTickets);
router.get("/tickets/mine", auth, getMyTickets);
router.get("/tickets/:ticketId/messages", optionalAuth, getTicketMessages);
router.patch("/tickets/:ticketId/status", auth, updateTicketStatus);

module.exports = router;
