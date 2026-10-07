const crypto = require("crypto");
const mongoose = require("mongoose");
const Invitation = require("../models/Invitation");
const Restaurant = require("../models/Restaurant");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const catchAsync = require("../utils/catchAsync");
const generateToken = require("../utils/generateToken");
const { sendRegistrationInvitationEmail } = require("../utils/sendEmail");

const INVITE_ROLES = new Set([
  "customer",
  "user",
  "employer",
  "owner",
  "advertisor",
  "Admin",
  "viewer",
  "store",
]);
const INVITATION_LIFETIME_MS = 2 * 60 * 60 * 1000;
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const frontendUrl = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");

async function createInvitation({ email, role, createdBy, restaurant }) {
  const normalizedEmail = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new AppError("Enter a valid email address.", 400);
  }
  if (!INVITE_ROLES.has(role)) {
    throw new AppError("The selected account role is invalid.", 400);
  }

  const existingUser = await User.findOne({
    email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: "i" },
  }).select("_id");
  if (existingUser) {
    throw new AppError("An account with this email already exists.", 409);
  }

  if (role === "employer" && !restaurant) {
    throw new AppError("An employer invitation must be linked to a restaurant.", 400);
  }
  if (role !== "employer" && restaurant) {
    throw new AppError("Only employer invitations can be linked to a restaurant.", 400);
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
  await Invitation.updateMany(
    { email: normalizedEmail, usedAt: null },
    { $set: { usedAt: new Date() } },
  );
  const invitation = await Invitation.create({
    email: normalizedEmail,
    role,
    tokenHash: hashToken(rawToken),
    createdBy: createdBy._id,
    restaurant: restaurant?._id || null,
    expiresAt,
  });

  const invitationUrl = `${frontendUrl()}/register/invitation/${rawToken}`;
  try {
    await sendRegistrationInvitationEmail({
      to: normalizedEmail,
      role,
      invitationUrl,
      restaurantName: restaurant?.name,
    });
  } catch (error) {
    await Invitation.findByIdAndDelete(invitation._id);
    console.error("Registration invitation email delivery failed:", error);
    throw new AppError("Could not send the invitation email. Please try again later.", 502);
  }

  return { email: normalizedEmail, role, expiresAt };
}

exports.createAdminInvitation = catchAsync(async (req, res) => {
  const { email, role, restaurantId } = req.body;
  let restaurant = null;

  if (restaurantId) {
    if (!mongoose.isValidObjectId(restaurantId)) {
      throw new AppError("Invalid restaurant.", 400);
    }
    restaurant = await Restaurant.findById(restaurantId).select("_id name");
    if (!restaurant) throw new AppError("Restaurant not found.", 404);
  }

  const invitation = await createInvitation({
    email,
    role,
    createdBy: req.user,
    restaurant,
  });

  return res.status(201).json({
    success: true,
    message: "Registration invitation sent.",
    invitation,
  });
});

exports.createEmployerInvitation = catchAsync(async (req, res) => {
  const { restaurantId } = req.params;
  if (!mongoose.isValidObjectId(restaurantId)) {
    throw new AppError("Invalid restaurant.", 400);
  }

  const restaurant = await Restaurant.findOne({
    _id: restaurantId,
    owner: req.user._id,
  }).select("_id name");
  if (!restaurant) {
    throw new AppError("Restaurant not found or you do not own it.", 404);
  }

  const invitation = await createInvitation({
    email: req.body.email,
    role: "employer",
    createdBy: req.user,
    restaurant,
  });

  return res.status(201).json({
    success: true,
    message: "Employer invitation sent.",
    invitation,
  });
});

exports.getInvitation = catchAsync(async (req, res) => {
  const invitation = await Invitation.findOne({
    tokenHash: hashToken(req.params.token),
    usedAt: null,
    expiresAt: { $gt: new Date() },
  }).populate("restaurant", "name");

  if (!invitation) {
    throw new AppError("This invitation is invalid, expired, or already used.", 410);
  }

  return res.status(200).json({
    success: true,
    invitation: {
      email: invitation.email,
      role: invitation.role,
      restaurantName: invitation.restaurant?.name || null,
      expiresAt: invitation.expiresAt,
    },
  });
});

exports.acceptInvitation = catchAsync(async (req, res) => {
  const { token } = req.params;
  const { name, password } = req.body;
  const tokenHash = hashToken(token);

  if (typeof password !== "string" || password.length < 8) {
    throw new AppError("Password must be at least 8 characters long.", 400);
  }

  const invitation = await Invitation.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!invitation) {
    throw new AppError("This invitation is invalid, expired, or already used.", 410);
  }

  if (invitation.role === "employer" && !invitation.restaurant) {
    throw new AppError("This employer invitation is missing its restaurant association.", 400);
  }

  const existingUser = await User.findOne({
    email: { $regex: `^${escapeRegex(invitation.email)}$`, $options: "i" },
  }).select("_id");
  if (existingUser) {
    throw new AppError("An account with this email already exists.", 409);
  }

  const claimedAt = new Date();
  const claimedInvitation = await Invitation.findOneAndUpdate(
    {
      _id: invitation._id,
      usedAt: null,
      expiresAt: { $gt: claimedAt },
    },
    { $set: { usedAt: claimedAt } },
    { new: true },
  );
  if (!claimedInvitation) {
    throw new AppError("This invitation has already been used or has expired.", 410);
  }

  let user;
  try {
    user = await User.create({
      name: String(name || "").trim() || invitation.email.split("@")[0],
      email: invitation.email,
      password,
      role: invitation.role,
    });

    if (invitation.restaurant) {
      const restaurantUpdate = await Restaurant.updateOne(
        { _id: invitation.restaurant },
        { $addToSet: { employers: user._id } },
      );
      if (!restaurantUpdate.matchedCount) {
        throw new AppError("The invited restaurant no longer exists.", 409);
      }
    }
  } catch (error) {
    if (user) await User.findByIdAndDelete(user._id);
    await Invitation.updateOne(
      { _id: claimedInvitation._id, usedAt: claimedAt },
      { $set: { usedAt: null } },
    );
    if (error.code === 11000) {
      throw new AppError("An account with this email already exists.", 409);
    }
    throw error;
  }

  const authToken = generateToken(user._id);
  return res.status(201).json({
    success: true,
    token: authToken,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});
