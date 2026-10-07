const crypto = require("crypto");
const { hashAccessToken, canAccessTicket } = require("../utils/supportAccess");
const SupportTicket = require("../models/SupportTicket");
const SupportMessage = require("../models/SupportMessage");
const { getSocket } = require("../utils/socket");

const requireAdmin = (req, res) => {
  if (req.user?.role === "Admin") {
    return false;
  }

  res.status(403).json({
    success: false,
    message: "Only support administrators can perform this action.",
  });
  return true;
};

const createTicket = async (req, res) => {
  try {
    const { name, email, subject, category = "general", message } = req.body || {};
    const allowedCategories = ["general", "payments", "account", "technical"];
    const ticketName = String(name || req.user?.name || "").trim();
    const ticketEmail = String(email || req.user?.email || "")
      .trim()
      .toLowerCase();
    const ticketSubject = String(subject || "").trim();
    const body = String(message || "").trim();

    if (
      !ticketName ||
      ticketName.length > 100 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ticketEmail) ||
      ticketEmail.length > 254 ||
      !ticketSubject ||
      ticketSubject.length > 160 ||
      !body ||
      body.length > 4000 ||
      !allowedCategories.includes(category)
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide a valid name, email, subject, category, and message.",
      });
    }

    const accessToken = req.user ? null : crypto.randomBytes(32).toString("hex");
    const ticket = await SupportTicket.create({
      user: req.user?._id || null,
      name: ticketName,
      email: ticketEmail,
      subject: ticketSubject,
      category,
      guestAccessHash: accessToken ? hashAccessToken(accessToken) : null,
    });
    let firstMessage;
    try {
      firstMessage = await SupportMessage.create({
        ticket: ticket._id,
        sender: req.user?._id || null,
        senderRole: "customer",
        body,
      });
    } catch (error) {
      await SupportTicket.findByIdAndDelete(ticket._id);
      throw error;
    }

    const io = getSocket();
    io?.to("support:admins").emit("support:ticket:new", {
      ticket: {
        _id: ticket._id,
        name: ticket.name,
        email: ticket.email,
        subject: ticket.subject,
        category: ticket.category,
        status: ticket.status,
        lastMessageAt: ticket.lastMessageAt,
      },
      message: firstMessage,
    });

    return res.status(201).json({
      success: true,
      ticket: {
        _id: ticket._id,
        name: ticket.name,
        email: ticket.email,
        subject: ticket.subject,
        category: ticket.category,
        status: ticket.status,
      },
      accessToken,
      message: firstMessage,
    });
  } catch (error) {
    console.error("CREATE SUPPORT TICKET ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not create the support ticket.",
    });
  }
};

const getTicketMessages = async (req, res) => {
  try {
    const ticket = await canAccessTicket({
      ticketId: req.params.ticketId,
      user: req.user,
      accessToken: req.headers["x-ticket-access-token"],
    });
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found.",
      });
    }

    const messages = await SupportMessage.find({ ticket: ticket._id })
      .sort({ createdAt: 1 })
      .limit(500)
      .select("ticket senderRole body createdAt");

    return res.status(200).json({
      success: true,
      ticket: {
        _id: ticket._id,
        name: ticket.name,
        email: ticket.email,
        subject: ticket.subject,
        category: ticket.category,
        status: ticket.status,
      },
      messages,
    });
  } catch (error) {
    console.error("GET SUPPORT MESSAGES ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load support messages.",
    });
  }
};

const getAdminTickets = async (req, res) => {
  if (requireAdmin(req, res)) return;

  try {
    const status = req.query.status;
    const query = ["open", "closed"].includes(status) ? { status } : {};
    const tickets = await SupportTicket.find(query)
      .sort({ lastMessageAt: -1 })
      .limit(200)
      .select("name email subject category status lastMessageAt createdAt");
    return res.status(200).json({ success: true, tickets });
  } catch (error) {
    console.error("GET ADMIN SUPPORT TICKETS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load support tickets.",
    });
  }
};

const updateTicketStatus = async (req, res) => {
  if (requireAdmin(req, res)) return;
  if (!["open", "closed"].includes(req.body?.status)) {
    return res.status(400).json({
      success: false,
      message: "Ticket status must be open or closed.",
    });
  }

  try {
    const ticket = await SupportTicket.findByIdAndUpdate(
      req.params.ticketId,
      { status: req.body.status },
      { new: true, runValidators: true },
    ).select("name email subject category status lastMessageAt createdAt");

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Support ticket not found.",
      });
    }

    getSocket()?.to(`support:ticket:${ticket._id}`).emit("support:ticket:status", {
      status: ticket.status,
    });

    return res.status(200).json({ success: true, ticket });
  } catch (error) {
    console.error("UPDATE SUPPORT TICKET STATUS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not update the ticket status.",
    });
  }
};

const getMyTickets = async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ user: req.user._id })
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .select("name email subject category status lastMessageAt createdAt");
    return res.status(200).json({ success: true, tickets });
  } catch (error) {
    console.error("GET MY SUPPORT TICKETS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load your support tickets.",
    });
  }
};

module.exports = {
  createTicket,
  getTicketMessages,
  getAdminTickets,
  getMyTickets,
  updateTicketStatus,
};
