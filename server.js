require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 5000;

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://menupio.pt",
];
app.use(
  cors({
    origin: allowedOrigins,
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

/*
|--------------------------------------------------------------------------
| SECURITY / MIDDLEWARE
|--------------------------------------------------------------------------
*/

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);

app.use(compression());

app.use(morgan("dev"));

app.use(express.json({ limit: "20mb" }));

app.use(express.urlencoded({ extended: true }));

/*
|--------------------------------------------------------------------------
| STATIC UPLOADS
|--------------------------------------------------------------------------
*/

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    app: "Restaurant Digital Menu API",
    version: "1.0.0",
  });
});

app.get("/health", (req, res) => {
  const mongoState = mongoose.connection.readyState;

  res.status(200).json({
    status: "UP",
    mongodb: mongoState === 1 ? "CONNECTED" : "DISCONNECTED",
    timestamp: new Date(),
  });
});

/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/

app.use("/api/auth", require("./routes/auth"));

app.use("/api/users", require("./routes/user"));

app.use("/api/restaurants", require("./routes/restaurant"));

app.use("/api/categories", require("./routes/category"));

app.use("/api/products", require("./routes/menuItem"));

app.use("/api/menu", require("./routes/menu"));

/*
|--------------------------------------------------------------------------
| 404
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use((err, req, res, next) => {
  console.error("❌ SERVER ERROR:", err);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

/*
|--------------------------------------------------------------------------
| MONGODB EVENTS
|--------------------------------------------------------------------------
*/

mongoose.connection.on("connected", () => {
  console.log("✅ MongoDB Connected");
});

mongoose.connection.on("error", (error) => {
  console.error("❌ MongoDB Error:", error.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB Disconnected");
});

/*
|--------------------------------------------------------------------------
| MONGODB CONNECTION
|--------------------------------------------------------------------------
*/

const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    console.log("✅ MongoDB connection established");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error.message);

    console.log("🔄 MongoDB will retry automatically...");
  }
};

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);

  connectMongoDB();
});

/*
|--------------------------------------------------------------------------
| GRACEFUL SHUTDOWN
|--------------------------------------------------------------------------
*/

const shutdown = async (signal) => {
  console.log(`\n${signal} received. Shutting down...`);

  try {
    await mongoose.connection.close();

    console.log("MongoDB disconnected");

    process.exit(0);
  } catch (error) {
    console.error("Shutdown error:", error);

    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));

process.on("SIGTERM", () => shutdown("SIGTERM"));
