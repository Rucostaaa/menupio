const Booking = require("../models/Booking.js");
const Review = require("../models/Review.js");
const mongoose = require("mongoose");

const { isValidObjectId } = mongoose;

const getAuthenticatedUserId = (req) => {
  return req.user?._id || req.user?.id || null;
};

const normalizeRating = (value) => {
  const rating = Number(value);

  if (!Number.isFinite(rating)) {
    return null;
  }

  if (rating < 1 || rating > 5) {
    return null;
  }

  return Math.round(rating);
};

const normalizeText = (value, maxLength) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
};

const getBookingDateTime = (booking) => {
  if (!booking?.date || !booking?.time) {
    return null;
  }

  const date = new Date(booking.date);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const [hours, minutes] = String(booking.time).split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  date.setHours(hours, minutes, 0, 0);

  return date;
};

const createReview = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Utilizador não autenticado.",
      });
    }

    const { bookingId, ratings = {}, comment = "" } = req.body;

    if (!bookingId || !isValidObjectId(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Reserva inválida.",
      });
    }

    const appRating = normalizeRating(ratings.app);
    const employeeRating = normalizeRating(ratings.employee);
    const spaceRating = normalizeRating(ratings.space);
    const overallRating = normalizeRating(ratings.overall);

    if (
      appRating === null ||
      employeeRating === null ||
      spaceRating === null ||
      overallRating === null
    ) {
      return res.status(400).json({
        success: false,
        message: "Todas as avaliações devem estar entre 1 e 5.",
      });
    }

    const booking = await Booking.findById(bookingId)
      .populate("restaurant")
      .populate("barber");

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Reserva não encontrada.",
      });
    }

    if (String(booking.user) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: "Não tens permissão para avaliar esta reserva.",
      });
    }

    if (booking.status === "cancelled" || booking.status === "canceled") {
      return res.status(400).json({
        success: false,
        message: "Uma reserva cancelada não pode ser avaliada.",
      });
    }

    const appointmentStart = getBookingDateTime(booking);

    if (!appointmentStart) {
      return res.status(400).json({
        success: false,
        message: "Não foi possível determinar a data da reserva.",
      });
    }

    const durationMinutes = Number(booking.duration || 0);

    const appointmentEnd = new Date(
      appointmentStart.getTime() + durationMinutes * 60 * 1000,
    );

    if (new Date() < appointmentEnd) {
      return res.status(400).json({
        success: false,
        message: "Só podes avaliar a reserva depois do atendimento.",
      });
    }

    if (!booking.restaurant) {
      return res.status(400).json({
        success: false,
        message: "A reserva não tem restaurante associado.",
      });
    }

    if (!booking.barber) {
      return res.status(400).json({
        success: false,
        message: "A reserva não tem profissional associado.",
      });
    }

    const existingReview = await Review.findOne({
      booking: booking._id,
    });

    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "Esta reserva já foi avaliada.",
        review: existingReview,
      });
    }

    const review = await Review.create({
      booking: booking._id,
      user: userId,
      restaurant: booking.restaurant._id || booking.restaurant,
      barber: booking.barber._id || booking.barber,

      ratings: {
        app: appRating,
        employee: employeeRating,
        space: spaceRating,
        overall: overallRating,
      },

      comment: normalizeText(comment, 2000),
      improvement: "",
    });

    const populatedReview = await Review.findById(review._id)
      .populate("booking")
      .populate("restaurant")
      .populate("barber")
      .populate("user");

    return res.status(201).json({
      success: true,
      message: "Avaliação enviada com sucesso.",
      review: populatedReview,
    });
  } catch (error) {
    console.error("createReview error:", error);

    return res.status(500).json({
      success: false,
      message: "Erro ao criar avaliação.",
      error: error.message,
    });
  }
};

const updateReview = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { reviewId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Utilizador não autenticado.",
      });
    }

    if (!isValidObjectId(reviewId)) {
      return res.status(400).json({
        success: false,
        message: "Avaliação inválida.",
      });
    }

    const improvement = normalizeText(req.body?.improvement, 3000);

    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Avaliação não encontrada.",
      });
    }

    if (String(review.user) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: "Não tens permissão para editar esta avaliação.",
      });
    }

    review.improvement = improvement;

    await review.save();

    const populatedReview = await Review.findById(review._id)
      .populate("booking")
      .populate("restaurant")
      .populate("barber")
      .populate("user");

    return res.status(200).json({
      success: true,
      message: "Obrigado por nos ajudares a melhorar!",
      review: populatedReview,
    });
  } catch (error) {
    console.error("updateReview error:", error);

    return res.status(500).json({
      success: false,
      message: "Erro ao atualizar avaliação.",
      error: error.message,
    });
  }
};

const getReviewByBooking = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { bookingId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Utilizador não autenticado.",
      });
    }

    if (!isValidObjectId(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Reserva inválida.",
      });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Reserva não encontrada.",
      });
    }

    if (String(booking.user) !== String(userId)) {
      return res.status(403).json({
        success: false,
        message: "Não tens acesso a esta reserva.",
      });
    }

    const review = await Review.findOne({
      booking: bookingId,
    })
      .populate("restaurant")
      .populate("barber");

    return res.status(200).json({
      success: true,
      review: review || null,
      hasReview: Boolean(review),
    });
  } catch (error) {
    console.error("getReviewByBooking error:", error);

    return res.status(500).json({
      success: false,
      message: "Erro ao obter avaliação.",
      error: error.message,
    });
  }
};

const getMyReviews = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Utilizador não autenticado.",
      });
    }

    const reviews = await Review.find({
      user: userId,
    })
      .populate("booking")
      .populate("restaurant")
      .populate("barber")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      reviews,
    });
  } catch (error) {
    console.error("getMyReviews error:", error);

    return res.status(500).json({
      success: false,
      message: "Erro ao obter as tuas avaliações.",
      error: error.message,
    });
  }
};

const getRestaurantReviews = async (req, res) => {
  try {
    const { restaurantId } = req.params;

    if (!isValidObjectId(restaurantId)) {
      return res.status(400).json({
        success: false,
        message: "Restaurante inválido.",
      });
    }

    const reviews = await Review.find({
      restaurant: restaurantId,
    })
      .populate("user")
      .populate("barber")
      .populate("booking")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      reviews,
    });
  } catch (error) {
    console.error("getRestaurantReviews error:", error);

    return res.status(500).json({
      success: false,
      message: "Erro ao obter avaliações do restaurante.",
      error: error.message,
    });
  }
};

const getBarberReviews = async (req, res) => {
  try {
    const { barberId } = req.params;

    if (!isValidObjectId(barberId)) {
      return res.status(400).json({
        success: false,
        message: "Profissional inválido.",
      });
    }

    const reviews = await Review.find({
      barber: barberId,
    })
      .populate("user")
      .populate("restaurant")
      .populate("booking")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      reviews,
    });
  } catch (error) {
    console.error("getBarberReviews error:", error);

    return res.status(500).json({
      success: false,
      message: "Erro ao obter avaliações do profissional.",
      error: error.message,
    });
  }
};

module.exports = {
  createReview,
  updateReview,
  getReviewByBooking,
  getMyReviews,
  getRestaurantReviews,
  getBarberReviews,
};
