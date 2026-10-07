const nodemailer = require("nodemailer");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

async function sendEmail({ to, subject, text, html }) {
  const fromEmail = process.env.GMAIL_SMTP_USER;
  const appPassword = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s/g, "");
  const fromName = process.env.GMAIL_SMTP_FROM_NAME || "Menupio";

  if (!fromEmail || !appPassword) {
    throw new Error(
      "Gmail SMTP is not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD.",
    );
  }
  if (!fromEmail || !to || !subject || !text || !html) {
    throw new Error("Email sender, recipient, subject and content are required.");
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: fromEmail,
      pass: appPassword,
    },
  });

  const info = await transporter.sendMail({
    from: { address: fromEmail, name: fromName },
    to,
    subject,
    text,
    html,
  });

  return {
    operationId: info.messageId || null,
  };
}

async function sendRegistrationInvitationEmail({ to, role, invitationUrl, restaurantName }) {
  const safeRole = escapeHtml(role);
  const safeRestaurant = restaurantName ? escapeHtml(restaurantName) : "";
  const safeUrl = escapeHtml(invitationUrl);
  const subject = "Complete a tua inscrição no Menupio";
  const organizationLine = safeRestaurant
    ? `Foste convidado para colaborar com ${restaurantName}.`
    : "Recebeste um convite para criar uma conta Menupio.";
  const text = [
    "Olá,",
    "",
    organizationLine,
    `Role: ${role}`,
    "",
    "Abre este link para concluir a inscrição. O link expira em 2 horas e só pode ser utilizado uma vez:",
    invitationUrl,
    "",
    "Se não estavas à espera deste convite, podes ignorar esta mensagem.",
    "Menupio",
  ].join("\n");
  const html = `
    <!doctype html>
    <html lang="pt">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body style="margin:0;background:#f5f1ed;font-family:Arial,sans-serif;color:#3e2d22">
        <main style="max-width:560px;margin:36px auto;padding:32px;background:#fff;border-radius:20px">
          <p style="font-weight:700;letter-spacing:3px;color:#a95e28">MENUPIO</p>
          <h1 style="font-size:25px">Convite de inscrição</h1>
          <p>${escapeHtml(organizationLine)}</p>
          <p>Perfil: <strong>${safeRole}</strong>${safeRestaurant ? ` · ${safeRestaurant}` : ""}</p>
          <p>O link é válido durante 2 horas e só pode ser utilizado uma vez.</p>
          <p style="margin:28px 0">
            <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;background:#8e3928;color:#fff;text-decoration:none;border-radius:10px;font-weight:bold">Criar conta</a>
          </p>
          <p style="font-size:12px;color:#806e60">Se não estavas à espera deste convite, ignora esta mensagem.</p>
        </main>
      </body>
    </html>`;

  return sendEmail({ to, subject, text, html });
}

module.exports = { sendEmail, sendRegistrationInvitationEmail };
