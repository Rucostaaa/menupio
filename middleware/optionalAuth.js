const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return next();
  }

  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Invalid authorization header.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("_id name email role");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found.",
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    console.error("OPTIONAL AUTH ERROR:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid token.",
    });
  }
};
