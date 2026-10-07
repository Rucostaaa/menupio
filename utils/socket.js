const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const SupportMessage = require("../models/SupportMessage");
const { canAccessTicket } = require("./supportAccess");
const { attachBellumNumerusSocket } = require("./bellumNumerusSocket");
const { attachMixedMathQuizSocket } = require("./mixedMathQuizSocket");
const { attachWordSearchSocket } = require("./wordSearchSocket");

let io;

const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://menupio.pt",
        "https://gamer.menupio.pt",
      ],
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        socket.user = null;
        return next();
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.id).select("_id role name");

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.user = user;

      next();
    } catch (error) {
      next(new Error("Invalid socket authentication"));
    }
  });

  io.on("connection", (socket) => {
    attachBellumNumerusSocket(io, socket);
    attachMixedMathQuizSocket(io, socket);
    attachWordSearchSocket(io, socket);

    if (socket.user?._id) {
      const userId = String(socket.user._id);
      socket.join(`user:${userId}`);
      console.log(`user:${userId} connected`);
      socket.emit("loyalty:connected", { userId });

      if (socket.user.role === "Admin") {
        socket.join("support:admins");
      }
    }

    socket.on(
      "support:ticket:join",
      async (data = {}, acknowledge = () => {}) => {
        try {
          const ticket = await canAccessTicket({
            ticketId: data.ticketId,
            user: socket.user,
            accessToken: data.accessToken,
          });
          if (!ticket) {
            acknowledge({ success: false, message: "Ticket access denied." });
            return;
          }

          socket.join(`support:ticket:${ticket._id}`);
          acknowledge({
            success: true,
            ticket: {
              _id: ticket._id,
              status: ticket.status,
              subject: ticket.subject,
            },
          });
        } catch (error) {
          console.error("SUPPORT SOCKET JOIN ERROR:", error);
          acknowledge({
            success: false,
            message: "Could not join this ticket.",
          });
        }
      },
    );

    socket.on(
      "support:message:send",
      async (data = {}, acknowledge = () => {}) => {
        try {
          const body = String(data.body || "").trim();
          if (!body || body.length > 4000) {
            acknowledge({
              success: false,
              message: "Messages must contain 1 to 4000 characters.",
            });
            return;
          }

          const ticket = await canAccessTicket({
            ticketId: data.ticketId,
            user: socket.user,
            accessToken: data.accessToken,
          });
          if (!ticket || ticket.status !== "open") {
            acknowledge({
              success: false,
              message: "This ticket is unavailable or closed.",
            });
            return;
          }

          const isAdmin = socket.user?.role === "Admin";
          const message = await SupportMessage.create({
            ticket: ticket._id,
            sender: socket.user?._id || null,
            senderRole: isAdmin ? "admin" : "customer",
            body,
          });
          ticket.lastMessageAt = new Date();
          await ticket.save();

          const messageData = {
            _id: message._id,
            ticket: String(ticket._id),
            senderRole: message.senderRole,
            body: message.body,
            createdAt: message.createdAt,
          };

          io.to(`support:ticket:${ticket._id}`).emit(
            "support:message:new",
            messageData,
          );
          io.to("support:admins").emit("support:ticket:activity", {
            ticketId: String(ticket._id),
            lastMessageAt: ticket.lastMessageAt,
            message: messageData,
          });
          acknowledge({ success: true, message: messageData });
        } catch (error) {
          console.error("SUPPORT SOCKET MESSAGE ERROR:", error);
          acknowledge({
            success: false,
            message: "Could not send this message.",
          });
        }
      },
    );
  });

  return io;
};

const getSocket = () => io;

const emitLoyaltyUpdate = (userId, loyaltyCard) => {
  if (!io) {
    console.warn("Socket.IO is not initialized.");

    return;
  }

  if (!userId || !loyaltyCard?._id) {
    return;
  }

  io.to(`user:${String(userId)}`).emit("loyalty:updated", loyaltyCard);
};

module.exports = {
  initializeSocket,
  getSocket,
  emitLoyaltyUpdate,
};
