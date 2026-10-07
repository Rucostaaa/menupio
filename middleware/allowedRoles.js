const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const allowedRoles = (roles) => {
  if (!Array.isArray(roles)) {
    throw new TypeError("allowedRoles expects an array of role names.");
  }

  const normalizedRoles = new Set(roles.map(normalizeRole).filter(Boolean));

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!normalizedRoles.has(normalizeRole(req.user.role))) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource.",
      });
    }

    return next();
  };
};

module.exports = allowedRoles;
