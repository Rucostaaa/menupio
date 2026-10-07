const crypto = require("crypto");
const mongoose = require("mongoose");
const SupportTicket = require("../models/SupportTicket");

const hashAccessToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const canAccessTicket = async ({ ticketId, user, accessToken }) => {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    return null;
  }

  const ticket = await SupportTicket.findById(ticketId).select(
    "+guestAccessHash",
  );
  if (!ticket) {
    return null;
  }

  if (user?.role === "Admin") {
    return ticket;
  }

  if (user && ticket.user && String(ticket.user) === String(user._id)) {
    return ticket;
  }

  if (
    !ticket.user &&
    accessToken &&
    ticket.guestAccessHash &&
    crypto.timingSafeEqual(
      Buffer.from(ticket.guestAccessHash, "hex"),
      Buffer.from(hashAccessToken(accessToken), "hex"),
    )
  ) {
    return ticket;
  }

  return null;
};

module.exports = { hashAccessToken, canAccessTicket };
