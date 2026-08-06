const User = require("../models/User");
const catchAsync = require("../utils/catchAsync");
const generateToken = require("../utils/generateToken");
const AppError = require("../utils/AppError");

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
*/
exports.login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) throw new AppError("Invalid credentials", 401);

  const valid = await user.comparePassword(password);

  if (!valid) throw new AppError("Invalid credentials", 401);

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
