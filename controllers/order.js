const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const Menu = require("../models/Menu");
const Restaurant = require("../models/Restaurant");
const {
  createOrderPaymentIntent,
  getBookingPaymentIntent,
  getPopulatedBooking,
  updateBookingPaymentFromIntent,
  sendBookingError,
} = require("../middleware/helpers");

const getLocalizedValue = (value) => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value && typeof value.get === "function") {
    return value.get("pt") || value.get("en") || "";
  }

  if (value instanceof Map) {
    return value.get("pt") || value.get("en") || [...value.values()][0] || "";
  }

  if (value && typeof value === "object") {
    return (
      value.pt ||
      value.en ||
      Object.values(value).find(
        (entry) => typeof entry === "string" && entry.trim(),
      ) ||
      ""
    );
  }

  return "";
};

const toPublicOrder = (order) => {
  const data = typeof order?.toObject === "function" ? order.toObject() : order;
  return {
    ...data,
    customer: { name: data?.customer?.name || "" },
  };
};

const getOrderById = async (orderId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid order ID.");
    error.statusCode = 400;
    throw error;
  }

  const order = await Booking.findById(orderId).populate({
    path: "restaurant",
    select: "_id name stripe",
  });

  if (!order || order.kind !== "order") {
    const error = new Error("Order not found.");
    error.statusCode = 404;
    throw error;
  }

  return order;
};

const getRestaurantOrders = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ owner: req.user?._id }).select(
      "_id",
    );
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found.",
      });
    }

    const orders = await Booking.find({
      restaurant: restaurant._id,
      kind: "order",
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .select(
        "_id customer date time price orderItems status payment createdAt updatedAt",
      )
      .lean();

    return res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error("GET RESTAURANT ORDERS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not load restaurant orders.",
    });
  }
};

const updateRestaurantOrderStatus = async (req, res) => {
  const { status } = req.body || {};
  if (!["confirmed", "completed", "cancelled"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Choose a valid next order status.",
    });
  }

  try {
    const restaurant = await Restaurant.findOne({ owner: req.user?._id }).select(
      "_id",
    );
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found.",
      });
    }

    const order = await Booking.findOne({
      _id: req.params.orderId,
      restaurant: restaurant._id,
      kind: "order",
    });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    const allowedTransitions = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
      no_show: [],
    };
    if (order.status !== status && !allowedTransitions[order.status]?.includes(status)) {
      return res.status(409).json({
        success: false,
        message: "This order can no longer move to the requested status.",
      });
    }

    if (status === "cancelled" && order.payment?.status === "paid") {
      return res.status(409).json({
        success: false,
        message:
          "This order is already paid. Refund the payment before cancelling it.",
      });
    }

    order.status = status;
    await order.save();

    return res.status(200).json({
      success: true,
      order: {
        _id: order._id,
        status: order.status,
        updatedAt: order.updatedAt,
      },
    });
  } catch (error) {
    console.error("UPDATE RESTAURANT ORDER STATUS ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Could not update the order status.",
    });
  }
};

const createMenuOrder = async (req, res) => {
  try {
    const { menuId, customer, items } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(menuId)) {
      return res.status(400).json({
        success: false,
        message: "A valid menu is required.",
      });
    }

    if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
      return res.status(400).json({
        success: false,
        message: "An order must contain between 1 and 50 items.",
      });
    }

    if (
      !customer ||
      typeof customer.name !== "string" ||
      !customer.name.trim() ||
      customer.name.trim().length > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Customer name is required and must be under 100 characters.",
      });
    }

    const menu = await Menu.findById(menuId)
      .populate("restaurant")
      .populate("items.item");

    if (!menu || !menu.available || !menu.restaurant) {
      return res.status(404).json({
        success: false,
        message: "This menu is not available for ordering.",
      });
    }

    const restaurant = menu.restaurant;
    const uniqueIds = new Set();
    const orderItems = [];
    let totalCents = 0;

    for (const requestedItem of items) {
      const productId = String(requestedItem?.productId || "");
      const quantity = Number(requestedItem?.quantity);
      const variantId = requestedItem?.variantId
        ? String(requestedItem.variantId)
        : "";
      const notes =
        typeof requestedItem?.notes === "string"
          ? requestedItem.notes.trim()
          : "";

      if (
        !mongoose.Types.ObjectId.isValid(productId) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 99 ||
        notes.length > 300
      ) {
        return res.status(400).json({
          success: false,
          message: "One or more order items have invalid details.",
        });
      }

      const lineKey = `${productId}:${variantId}`;
      if (uniqueIds.has(lineKey)) {
        return res.status(400).json({
          success: false,
          message: "Duplicate order items must be combined.",
        });
      }
      uniqueIds.add(lineKey);

      const menuEntry = (menu.items || []).find(
        (entry) =>
          entry?.itemModel === "SiteItem" &&
          String(entry?.item?._id || entry?.item) === productId,
      );
      const product = menuEntry?.item;

      if (!product || typeof product !== "object") {
        return res.status(400).json({
          success: false,
          message: "An order item is not part of this menu.",
        });
      }

      const placement = (product.placements || []).find(
        (entry) => String(entry?.restaurant) === String(restaurant._id),
      );

      if (!placement) {
        return res.status(400).json({
          success: false,
          message: "A selected product is not offered by this restaurant.",
        });
      }

      const models = Array.isArray(placement.models) ? placement.models : [];
      let selectedModel = null;
      let unitPrice = Number(placement.price);

      if (models.length > 0) {
        selectedModel = models.find(
          (model) => String(model?._id) === variantId,
        );
        if (!selectedModel) {
          return res.status(400).json({
            success: false,
            message: "Select a valid option for each product.",
          });
        }
        unitPrice = Number(selectedModel.price);
      } else if (variantId) {
        return res.status(400).json({
          success: false,
          message: "A product option was supplied for an item without options.",
        });
      }

      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({
          success: false,
          message: "A selected product does not have a valid price.",
        });
      }

      const lineCents = Math.round(unitPrice * 100) * quantity;
      totalCents += lineCents;

      orderItems.push({
        product: product._id,
        name: getLocalizedValue(placement.name) || getLocalizedValue(product.name),
        variantName: selectedModel
          ? getLocalizedValue(selectedModel.title)
          : "",
        unitPrice: Math.round(unitPrice * 100) / 100,
        quantity,
        notes,
      });
    }

    if (totalCents < 1 || totalCents > 99999999) {
      return res.status(400).json({
        success: false,
        message: "The order total is outside the supported payment range.",
      });
    }

    const stripeAccountId = restaurant.stripe?.accountId || null;
    if (!stripeAccountId || restaurant.stripe?.chargesEnabled !== true || restaurant.stripe?.paymentsEnabled !== true) {
      return res.status(409).json({
        success: false,
        message:
          "This restaurant's Stripe account is not ready to accept menu payments.",
      });
    }

    const now = new Date();
    const order = await Booking.create({
      kind: "order",
      restaurant: restaurant._id,
      barber: null,
      type: "online",
      customer: {
        name: customer.name.trim(),
        phone: String(customer.phone || "").trim().slice(0, 30),
        email: String(customer.email || "").trim().toLowerCase().slice(0, 254),
      },
      date: now.toISOString().slice(0, 10),
      time: now.toISOString().slice(11, 16),
      duration: 1,
      price: totalCents / 100,
      orderItems,
      status: "pending",
      notes: "",
      payment: {
        status: "pending",
        stripePaymentIntentId: null,
        stripeAccountId,
        amount: totalCents,
        currency: "eur",
        paidAt: null,
      },
    });

    if (restaurant.menuCheckoutMode !== "pay_now") {
      return res.status(201).json({
        success: true,
        order: toPublicOrder(order),
        orderId: order._id,
        paymentRequired: false,
        checkoutMode: "pay_later",
      });
    }

    if (!stripeAccountId || restaurant.stripe?.chargesEnabled !== true || restaurant.stripe?.paymentsEnabled !== true) {
      await Booking.findByIdAndDelete(order._id);
      return res.status(409).json({
        success: false,
        message:
          "Immediate menu payment is selected, but this restaurant's Stripe account is not ready to accept payments.",
      });
    }

    try {
      const paymentIntent = await createOrderPaymentIntent(
        order,
        stripeAccountId,
      );
      order.payment.stripePaymentIntentId = paymentIntent.id;
      await order.save();

      return res.status(201).json({
        success: true,
        order: toPublicOrder(order),
        orderId: order._id,
        paymentRequired: true,
        checkoutMode: "pay_now",
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        stripeAccountId,
      });
    } catch (error) {
      await Booking.findByIdAndDelete(order._id);
      throw error;
    }
  } catch (error) {
    return sendBookingError(res, error, "Failed to create menu order.");
  }
};

const createOrderPaymentIntentForFollow = async (req, res) => {
  try {
    const order = await getOrderById(req.params.orderId);

    if (order.payment?.status === "paid") {
      return res.status(409).json({
        success: false,
        message: "This order has already been paid.",
      });
    }

    let paymentIntent = null;
    if (order.payment?.stripePaymentIntentId) {
      const existing = await getBookingPaymentIntent(order);
      if (existing.paymentIntent.status === "succeeded") {
        updateBookingPaymentFromIntent(order, existing.paymentIntent);
        order.status = "confirmed";
        await order.save();

        return res.status(200).json({
          success: true,
          alreadyPaid: true,
          order: toPublicOrder(await getPopulatedBooking(order._id)),
        });
      }

      if (!["canceled", "cancelled"].includes(existing.paymentIntent.status)) {
        paymentIntent = existing.paymentIntent;
      }
    }

    if (!paymentIntent) {
      const stripeAccountId =
        order.payment?.stripeAccountId || order.restaurant?.stripe?.accountId;
      if (!stripeAccountId || order.restaurant?.stripe?.chargesEnabled !== true) {
        return res.status(409).json({
          success: false,
          message:
            "This restaurant's Stripe account is not ready to accept payments.",
        });
      }

      paymentIntent = await createOrderPaymentIntent(order, stripeAccountId);
      order.payment.stripeAccountId = stripeAccountId;
      order.payment.stripePaymentIntentId = paymentIntent.id;
      order.payment.status = "pending";
      await order.save();
    }

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: order.payment.amount,
      currency: order.payment.currency,
      stripeAccountId:
        order.payment?.stripeAccountId || order.restaurant?.stripe?.accountId,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to prepare order payment.");
  }
};

const syncOrderPayment = async (req, res) => {
  try {
    const { paymentIntentId } = req.body || {};
    if (typeof paymentIntentId !== "string" || !paymentIntentId.trim()) {
      return res.status(400).json({
        success: false,
        message: "PaymentIntent ID is required.",
      });
    }

    const order = await getOrderById(req.params.orderId);
    if (
      order.payment?.stripePaymentIntentId &&
      order.payment.stripePaymentIntentId !== paymentIntentId
    ) {
      return res.status(409).json({
        success: false,
        message: "PaymentIntent does not belong to this order.",
      });
    }

    const { connectedStripe } = await getBookingPaymentIntent(order);
    const paymentIntent =
      await connectedStripe.paymentIntents.retrieve(paymentIntentId);

    if (
      paymentIntent.metadata?.bookingId !== String(order._id) ||
      paymentIntent.metadata?.type !== "order" ||
      paymentIntent.capture_method === "manual"
    ) {
      return res.status(409).json({
        success: false,
        message: "PaymentIntent does not belong to this order.",
      });
    }

    updateBookingPaymentFromIntent(order, paymentIntent);
    if (paymentIntent.status === "succeeded") {
      order.status = "confirmed";
    }
    await order.save();

    const updatedOrder = await getPopulatedBooking(order._id);
    return res.status(200).json({
      success: true,
      order: toPublicOrder(updatedOrder),
      paymentStatus: updatedOrder.payment.status,
    });
  } catch (error) {
    return sendBookingError(res, error, "Failed to update order payment.");
  }
};

module.exports = {
  getRestaurantOrders,
  updateRestaurantOrderStatus,
  createMenuOrder,
  createOrderPaymentIntentForFollow,
  syncOrderPayment,
};
