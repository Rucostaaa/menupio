const Advert = require("../models/Advert");
const Session = require("../models/Session");
const Menu = require("../models/Menu");

const catchAsync = require("../utils/catchAsync");

const getAllSessions = catchAsync(async (req, res) => {
  if (req.user) {
    const sessions = await Session.find({});
    res.status(200).json({ sucess: true, sessions, total: sessions.lenght() });
  }
});
const getAdverts = catchAsync(async (req, res) => {
  console.log("🔥 GET ADVERTS CONTROLLER HIT");

  const adverts = await Menu.find({
    isAdvert: true,
  })
    .populate("items")
    .populate({
      path: "restaurant",
      populate: {
        path: "employers",
        model: "User",
        select: "_id name schedule avatar avatarUrl profileImage",
      },
    })
    .sort({ createdAt: -1 });

  console.log("🔥 ADVERTS FOUND:", adverts.length);

  return res.status(200).json({
    success: true,
    adverts,
    total: adverts.length,
  });
});
const createSession = catchAsync(async (req, res) => {
  const { user, sessionTime, seen, clicked } = req.body;
  //const safeClicked=clicked if not array, if object create array[0]
  if (clicked.lenght() > 0) {
    const advert = await Advert.findbyId(clicked._id);
    const session = await Session.create({
      user,
      sessionTime,
      seen,
      safeClicked,
    });
    advert.clicks.push(session);
  }
});
const deleteManySessions = catchAsync(async (req, res) => {});
const advertClicked = catchAsync(async (req, res) => {});
const createOrder = catchAsync(async (req, res) => {});
const getSingleSession = catchAsync(async (req, res) => {});
const updateSession = catchAsync(async (req, res) => {});
const deleteSession = catchAsync(async (req, res) => {});

module.exports = {
  getAllSessions,
  createSession,
  deleteManySessions,
  advertClicked,
  createOrder,
  getSingleSession,
  updateSession,
  getAdverts,
  deleteSession,
};
