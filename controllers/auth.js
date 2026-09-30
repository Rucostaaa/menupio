const User = require("../models/User");
const catchAsync = require("../utils/catchAsync");
const generateToken = require("../utils/generateToken");
const AppError = require("../utils/AppError");
const Restaurant = require("../models/Restaurant");

/*
|--------------------------------------------------------------------------
| REGISTER
|--------------------------------------------------------------------------
*/
exports.register = catchAsync(async (req, res) => {
  const { name, email, password, role } = req.body;

  const exists = await User.findOne({ email });

  if (exists) throw new AppError("Email already exists", 400);

  const user = await User.create({
    name,
    email,
    password,
    role,
  });

  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/ exports.login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  const user = await User.findOne({ email });

  if (!user) throw new AppError("Credenciais invalidas", 401);

  const valid = await user.comparePassword(password);

  if (!valid) throw new AppError("Credenciais invalidas", 401);

  const token = generateToken(user._id);

  res.json({
    success: true,
    token,
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});

exports.getCurrentUser = catchAsync(async (req, res) => {
  // ----------------------------------------------------------
  // 1. Get authenticated user ID from auth middleware
  // ----------------------------------------------------------

  const userId = req.user?._id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Utilizador não autenticado.",
    });
  }

  // ----------------------------------------------------------
  // 2. Find the complete user
  // ----------------------------------------------------------

  const user = await User.findById(userId)
    .select("-password")
    .populate({
      path: "bookings",
      model: "Booking",
    })
    .populate({
      path: "loyaltyCards.restaurant",
      select: "name logo hasFidelization fidelization",
    })
    .populate({
      path: "loyaltyCards.menuItem",
      model: "SiteItem",
      select: "name images image",
    });
  const restaurants = await Restaurant.find({ owner: user._id }).populate({
    path: "employers",
    model: "User",
  });
  // ----------------------------------------------------------
  // 3. User not found
  // ----------------------------------------------------------

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "Utilizador não encontrado.",
    });
  }

  // ----------------------------------------------------------
  // 4. Return current user
  // ----------------------------------------------------------
  console.log(user);

  return res.status(200).json({
    success: true,
    user,
    restaurants,
  });
});
