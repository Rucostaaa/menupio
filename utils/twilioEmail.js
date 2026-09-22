/**
 * utils/twilioEmail.js
 *
 * Sends Menupio booking confirmation emails
 * through the Twilio Email API.
 */

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const sendBookingConfirmationEmail = async (booking) => {
  if (!booking) {
    throw new Error("Booking is required.");
  }

  // =========================================================
  // ENVIRONMENT
  // =========================================================

  const accountSid = process.env.TWILIO_ACCOUNT_SID;

  const authToken = process.env.TWILIO_AUTH_TOKEN;

  const fromEmail = process.env.TWILIO_EMAIL_FROM || "bookings@menupio.com";

  const fromName = process.env.TWILIO_EMAIL_FROM_NAME || "Menupio";

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID is missing.");
  }

  if (!authToken) {
    throw new Error("TWILIO_AUTH_TOKEN is missing.");
  }

  if (!fromEmail) {
    throw new Error("TWILIO_EMAIL_FROM is missing.");
  }

  // =========================================================
  // CUSTOMER
  // =========================================================

  const customerEmail = booking.customer?.email?.trim();

  if (!customerEmail) {
    throw new Error("Customer email is required to send the booking email.");
  }

  const customerName = booking.customer?.name || "Cliente";

  // =========================================================
  // BOOKING DATA
  // =========================================================

  const restaurantName = booking.restaurant?.name || "Menupio";

  const barberName =
    booking.barber?.name ||
    booking.barber?.firstName ||
    booking.barber?.username ||
    "Profissional";

  const serviceName =
    booking.item?.name?.pt ||
    booking.item?.name ||
    booking.item?.title?.pt ||
    booking.item?.title ||
    "Serviço";

  const duration = Number(booking.duration) > 0 ? Number(booking.duration) : 0;

  const price = Number(booking.price) >= 0 ? Number(booking.price) : 0;

  const currency = booking.payment?.currency?.toUpperCase() || "EUR";

  // =========================================================
  // FRONTEND URL
  // =========================================================

  const cleanFrontendUrl = frontendUrl.replace(/\/+$/, "");

  const bookingId = booking._id?.toString?.() || booking.id?.toString?.();

  if (!bookingId) {
    throw new Error("Booking ID is required to generate the tracking URL.");
  }

  /*
   * For now we use the booking ID.
   *
   * Later this can be replaced with a secure
   * trackingToken stored on the Booking model.
   */
  const trackingUrl = `${cleanFrontendUrl}/booking/${bookingId}`;

  // =========================================================
  // DATE
  // =========================================================

  let formattedDate = "";

  if (booking.date) {
    const date = new Date(`${booking.date}T12:00:00`);

    if (!Number.isNaN(date.getTime())) {
      formattedDate = new Intl.DateTimeFormat("pt-PT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(date);
    }
  }

  const formattedTime = booking.time || "";

  // =========================================================
  // PRICE
  // =========================================================

  const formattedPrice = new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
  }).format(price);

  // =========================================================
  // SUBJECT
  // =========================================================

  const subject = `Reserva confirmada — ${restaurantName}`;

  // =========================================================
  // HTML SAFE VALUES
  // =========================================================

  const safeCustomerName = escapeHtml(customerName);

  const safeRestaurantName = escapeHtml(restaurantName);

  const safeBarberName = escapeHtml(barberName);

  const safeServiceName = escapeHtml(serviceName);

  const safeFormattedDate = escapeHtml(formattedDate);

  const safeFormattedTime = escapeHtml(formattedTime);

  const safeDuration = escapeHtml(duration);

  const safeFormattedPrice = escapeHtml(formattedPrice);

  const safeTrackingUrl = escapeHtml(trackingUrl);

  // =========================================================
  // PLAIN TEXT
  // =========================================================

  const text = `
Olá ${customerName},

A tua reserva foi confirmada com sucesso.

${restaurantName}

Serviço: ${serviceName}
Profissional: ${barberName}
Data: ${formattedDate}
Hora: ${formattedTime}
Duração: ${duration} minutos
Total: ${formattedPrice}

Acompanha a tua reserva:
${trackingUrl}

Obrigado por utilizares o Menupio.

Menupio
  `.trim();

  // =========================================================
  // HTML
  // =========================================================

  const html = `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>${escapeHtml(subject)}</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f5f1ed;
    font-family:Arial,Helvetica,sans-serif;
    color:#3e2d22;
  "
>
  <div
    style="
      width:100%;
      padding:40px 16px;
      box-sizing:border-box;
    "
  >
    <div
      style="
        max-width:600px;
        margin:0 auto;
        background:#ffffff;
        border-radius:24px;
        overflow:hidden;
        border:1px solid #eaded2;
      "
    >

      <!-- HEADER -->

      <div
        style="
          background:#21140d;
          padding:32px 30px;
          color:#ffffff;
        "
      >
        <div
          style="
            font-size:13px;
            font-weight:700;
            letter-spacing:3px;
            color:#d8a45b;
            text-transform:uppercase;
          "
        >
          MENUPIO
        </div>

        <h1
          style="
            margin:14px 0 0;
            font-size:28px;
            line-height:1.25;
            font-weight:700;
          "
        >
          Reserva confirmada
        </h1>

        <p
          style="
            margin:10px 0 0;
            font-size:15px;
            line-height:1.6;
            color:#ffffffb8;
          "
        >
          A tua reserva foi confirmada com sucesso.
        </p>
      </div>

      <!-- CONTENT -->

      <div style="padding:30px;">

        <p
          style="
            margin:0 0 8px;
            font-size:16px;
            line-height:1.6;
          "
        >
          Olá <strong>${safeCustomerName}</strong>,
        </p>

        <p
          style="
            margin:0 0 24px;
            font-size:14px;
            line-height:1.7;
            color:#806e60;
          "
        >
          Aqui estão os detalhes da tua reserva.
        </p>

        <!-- RESTAURANT -->

        <div
          style="
            background:#fffaf5;
            border:1px solid #eaded2;
            border-radius:18px;
            padding:20px;
            margin-bottom:16px;
          "
        >
          <div
            style="
              font-size:11px;
              font-weight:700;
              letter-spacing:1.5px;
              text-transform:uppercase;
              color:#9a806d;
              margin-bottom:7px;
            "
          >
            Negócio
          </div>

          <div
            style="
              font-size:19px;
              font-weight:700;
              color:#4a2d1a;
            "
          >
            ${safeRestaurantName}
          </div>
        </div>

        <!-- BOOKING DETAILS -->

        <div
          style="
            border:1px solid #eaded2;
            border-radius:18px;
            overflow:hidden;
            margin-bottom:16px;
          "
        >

          <!-- SERVICE -->

          <div
            style="
              padding:16px 20px;
              border-bottom:1px solid #eee5dd;
            "
          >
            <div
              style="
                font-size:11px;
                font-weight:700;
                text-transform:uppercase;
                letter-spacing:1px;
                color:#9a806d;
                margin-bottom:5px;
              "
            >
              Serviço
            </div>

            <div
              style="
                font-size:15px;
                font-weight:700;
                color:#4a2d1a;
              "
            >
              ${safeServiceName}
            </div>
          </div>

          <!-- BARBER -->

          <div
            style="
              padding:16px 20px;
              border-bottom:1px solid #eee5dd;
            "
          >
            <div
              style="
                font-size:11px;
                font-weight:700;
                text-transform:uppercase;
                letter-spacing:1px;
                color:#9a806d;
                margin-bottom:5px;
              "
            >
              Profissional
            </div>

            <div
              style="
                font-size:15px;
                font-weight:700;
                color:#4a2d1a;
              "
            >
              ${safeBarberName}
            </div>
          </div>

          <!-- DATE -->

          <div
            style="
              padding:16px 20px;
              border-bottom:1px solid #eee5dd;
            "
          >
            <div
              style="
                font-size:11px;
                font-weight:700;
                text-transform:uppercase;
                letter-spacing:1px;
                color:#9a806d;
                margin-bottom:5px;
              "
            >
              Data
            </div>

            <div
              style="
                font-size:15px;
                font-weight:700;
                color:#4a2d1a;
              "
            >
              ${safeFormattedDate}
            </div>
          </div>

          <!-- TIME -->

          <div
            style="
              padding:16px 20px;
              border-bottom:1px solid #eee5dd;
            "
          >
            <div
              style="
                font-size:11px;
                font-weight:700;
                text-transform:uppercase;
                letter-spacing:1px;
                color:#9a806d;
                margin-bottom:5px;
              "
            >
              Hora
            </div>

            <div
              style="
                font-size:15px;
                font-weight:700;
                color:#4a2d1a;
              "
            >
              ${safeFormattedTime}
            </div>
          </div>

          <!-- DURATION -->

          <div
            style="
              padding:16px 20px;
            "
          >
            <div
              style="
                font-size:11px;
                font-weight:700;
                text-transform:uppercase;
                letter-spacing:1px;
                color:#9a806d;
                margin-bottom:5px;
              "
            >
              Duração
            </div>

            <div
              style="
                font-size:15px;
                font-weight:700;
                color:#4a2d1a;
              "
            >
              ${safeDuration} minutos
            </div>
          </div>

        </div>

        <!-- TOTAL -->

        <div
          style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            padding:20px;
            margin-bottom:24px;
            border-radius:18px;
            background:#21140d;
            color:#ffffff;
          "
        >
          <span
            style="
              font-size:13px;
              color:#ffffffaa;
            "
          >
            Total
          </span>

          <strong
            style="
              font-size:22px;
              color:#ffffff;
            "
          >
            ${safeFormattedPrice}
          </strong>
        </div>

        <!-- TRACKING -->

        <div
          style="
            text-align:center;
            padding:24px;
            background:#fffaf5;
            border:1px solid #eaded2;
            border-radius:20px;
          "
        >
          <div
            style="
              font-size:17px;
              font-weight:700;
              color:#4a2d1a;
              margin-bottom:8px;
            "
          >
            Acompanha a tua reserva
          </div>

          <p
            style="
              margin:0 0 20px;
              font-size:13px;
              line-height:1.6;
              color:#806e60;
            "
          >
            Consulta os detalhes e o estado da tua reserva
            através do botão abaixo.
          </p>

          <a
            href="${safeTrackingUrl}"
            style="
              display:inline-block;
              padding:14px 24px;
              border-radius:14px;
              background:#4a2d1a;
              color:#ffffff;
              text-decoration:none;
              font-size:14px;
              font-weight:700;
            "
          >
            Acompanhar a minha reserva
          </a>
        </div>

        <!-- FOOTER MESSAGE -->

        <p
          style="
            margin:28px 0 0;
            text-align:center;
            font-size:12px;
            line-height:1.7;
            color:#9a8a7d;
          "
        >
          Guarda este email para consultares a tua reserva
          quando precisares.
        </p>

      </div>

      <!-- FOOTER -->

      <div
        style="
          padding:20px 30px;
          background:#f8f3ee;
          border-top:1px solid #eaded2;
          text-align:center;
        "
      >
        <div
          style="
            font-size:13px;
            font-weight:800;
            letter-spacing:2px;
            color:#4a2d1a;
          "
        >
          MENUPIO
        </div>

        <p
          style="
            margin:7px 0 0;
            font-size:11px;
            color:#9a8a7d;
          "
        >
          Reservas simples. Negócios mais inteligentes.
        </p>
      </div>

    </div>
  </div>
</body>
</html>
  `.trim();

  // =========================================================
  // TWILIO EMAIL API PAYLOAD
  // =========================================================
  //
  // IMPORTANT:
  // Twilio Email API uses:
  //
  // from.address
  // to[].address
  // content.subject
  // content.html
  // content.text
  //
  // NOT:
  //
  // from.email
  // to[].email
  // subject/html/text at root level
  // =========================================================

  const payload = {
    from: {
      address: fromEmail,
      name: fromName,
    },

    to: [
      {
        address: customerEmail,
        name: customerName,
      },
    ],

    content: {
      subject,
      html,
      text,
    },
  };

  // =========================================================
  // DEBUG
  // =========================================================

  console.log("TWILIO EMAIL SEND:", {
    from: fromEmail,
    to: customerEmail,
    subject,
    bookingId,
  });

  // =========================================================
  // REQUEST
  // =========================================================

  const response = await fetch("https://comms.twilio.com/v1/Emails", {
    method: "POST",

    headers: {
      Authorization:
        "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),

      "Content-Type": "application/json",

      Accept: "application/json",
    },

    body: JSON.stringify(payload),
  });

  // =========================================================
  // RESPONSE
  // =========================================================

  const responseText = await response.text();

  let data = {};

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = {
      raw: responseText,
    };
  }

  // =========================================================
  // ERROR
  // =========================================================

  if (!response.ok) {
    const twilioErrors = Array.isArray(data?.errors) ? data.errors : [];

    const twilioMessage =
      twilioErrors.length > 0
        ? twilioErrors
            .map((item) => {
              const field = item?.field ? ` [${item.field}]` : "";

              return `${
                item?.message || item?.error || "Unknown Twilio error."
              }${field}`;
            })
            .join(" | ")
        : data?.message || data?.error || "Twilio Email API failed.";

    const error = new Error(
      typeof twilioMessage === "string"
        ? twilioMessage
        : JSON.stringify(twilioMessage),
    );

    error.statusCode = response.status;

    error.twilioResponse = data;

    console.error("=================================================");

    console.error("TWILIO EMAIL API ERROR");

    console.error("Status:", response.status);

    console.error("Message:", error.message);

    console.error("Errors:", JSON.stringify(data?.errors || [], null, 2));

    console.error("Full response:", JSON.stringify(data, null, 2));

    console.error("=================================================");

    throw error;
  }

  // =========================================================
  // SUCCESS
  // =========================================================

  const operationId =
    data?.operationId || data?.operation_id || data?.id || null;

  console.log("TWILIO EMAIL ACCEPTED:", {
    bookingId,
    operationId,
    to: customerEmail,
  });

  return {
    success: true,
    operationId,
    trackingUrl,
    message: "Booking confirmation email sent.",
  };
};

module.exports = {
  sendBookingConfirmationEmail,
};
