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
| Middleware
|--------------------------------------------------------------------------
*/

app.use(cors());

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
| Static Uploads
|--------------------------------------------------------------------------
*/

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/*
|--------------------------------------------------------------------------
| Health Check
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
| Routes
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
| Global Error Handler
|--------------------------------------------------------------------------
*/

app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

/*
|--------------------------------------------------------------------------
| MongoDB Events
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
| MongoDB Connection
|--------------------------------------------------------------------------
*/

const connectMongoDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URL, {
      autoIndex: true,

      // How long to wait for a server
      serverSelectionTimeoutMS: 5000,

      // How long to wait when connecting
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
| Start Server
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);

  connectMongoDB();
});

/*
|--------------------------------------------------------------------------
| Graceful Shutdown
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
