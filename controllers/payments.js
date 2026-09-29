const Stripe = require("stripe");

const Booking = require("../models/Booking");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const stripeWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature) {
    return res.status(400).json({
      success: false,
      message: "Missing Stripe signature.",
    });
  }

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured.");

    return res.status(500).json({
      success: false,
      message: "Stripe webhook is not configured.",
    });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (error) {
    console.error(
      "Stripe webhook signature verification failed:",
      error.message,
    );

    return res.status(400).json({
      success: false,
      message: "Invalid Stripe webhook signature.",
    });
  }

  try {
    switch (event.type) {
      /*
       * PAYMENT PROCESSING
       */
      case "payment_intent.processing": {
        const paymentIntent = event.data.object;

        const booking = await Booking.findOne({
          "payment.stripePaymentIntentId": paymentIntent.id,
        });

        if (!booking) {
          console.warn(
            "Booking not found for PaymentIntent:",
            paymentIntent.id,
          );

          break;
        }

        booking.payment.status = "processing";

        if (Number.isFinite(paymentIntent.amount)) {
          booking.payment.amount = paymentIntent.amount;
        }

        if (paymentIntent.currency) {
          booking.payment.currency = paymentIntent.currency;
        }

        await booking.save();

        break;
      }

      /*
       * PAYMENT SUCCEEDED
       */
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;

        const booking = await Booking.findOne({
          "payment.stripePaymentIntentId": paymentIntent.id,
        });

        if (!booking) {
          console.error(
            "❌ NO BOOKING FOUND FOR PAYMENT INTENT:",
            paymentIntent.id,
          );

          /*
           * IMPORTANT:
           * Return 500 here while debugging.
           *
           * This tells Stripe that we failed to process
           * the webhook and Stripe can retry it.
           */
          return res.status(500).json({
            success: false,
            message: "Booking not found for PaymentIntent.",
          });
        }

        booking.payment.status = "paid";

        booking.payment.stripePaymentIntentId = paymentIntent.id;

        if (Number.isFinite(paymentIntent.amount)) {
          booking.payment.amount = paymentIntent.amount;
        }

        booking.payment.currency = paymentIntent.currency || "eur";

        booking.payment.paidAt = new Date();

        if (booking.type === "online" && booking.status === "pending") {
          booking.status = "confirmed";
        }

        await booking.save();

        break;
      }

      /*
       * PAYMENT FAILED
       */
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;

        const booking = await Booking.findOne({
          "payment.stripePaymentIntentId": paymentIntent.id,
        });

        if (!booking) {
          console.warn(
            "Booking not found for failed PaymentIntent:",
            paymentIntent.id,
          );

          break;
        }

        booking.payment.status = "failed";

        if (Number.isFinite(paymentIntent.amount)) {
          booking.payment.amount = paymentIntent.amount;
        }

        booking.payment.currency = paymentIntent.currency || "eur";

        booking.payment.paidAt = null;

        /*
         * Keep the booking pending.
         *
         * This allows the customer to retry payment
         * if your frontend supports it.
         */
        if (booking.status === "confirmed") {
          booking.status = "pending";
        }

        await booking.save();

        break;
      }

      /*
       * PAYMENT CANCELLED
       */
      case "payment_intent.canceled": {
        const paymentIntent = event.data.object;

        const booking = await Booking.findOne({
          "payment.stripePaymentIntentId": paymentIntent.id,
        });

        if (!booking) {
          console.warn(
            "Booking not found for canceled PaymentIntent:",
            paymentIntent.id,
          );

          break;
        }

        booking.payment.status = "cancelled";

        booking.payment.paidAt = null;

        if (booking.status === "pending") {
          booking.status = "cancelled";
          booking.cancelledAt = new Date();
          booking.cancellationReason = "Stripe payment was cancelled.";
        }

        await booking.save();

        break;
      }

      /*
       * REFUND
       */
      case "charge.refunded": {
        const charge = event.data.object;

        const paymentIntentId = charge.payment_intent;

        if (!paymentIntentId) {
          break;
        }

        const booking = await Booking.findOne({
          "payment.stripePaymentIntentId": paymentIntentId,
        });

        if (!booking) {
          console.warn(
            "Booking not found for refunded payment:",
            paymentIntentId,
          );

          break;
        }

        booking.payment.status = "refunded";

        await booking.save();

        break;
      }

      default:
        break;
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error("Stripe webhook processing error:", error);

    /*
     * Returning 500 makes Stripe retry the webhook.
     */
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to process Stripe webhook.",
    });
  }
};

module.exports = {
  stripeWebhook,
};
