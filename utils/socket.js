const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

let io;

const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://menupio.pt",
      ],
      methods: ["GET", "POST"],
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.id).select("_id role");

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
    const userId = String(socket.user._id);

    socket.join(`user:${userId}`);

    console.log(`user:${userId} connected`);

    socket.emit("loyalty:connected", {
      userId,
    });
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
