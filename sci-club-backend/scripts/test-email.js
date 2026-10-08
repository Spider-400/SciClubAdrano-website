"use strict";

/**
 * scripts/test-email.js
 * Verifica la configurazione SMTP e invia UNA email di test a EMAIL_TO.
 *
 * Uso:  npm run test-email
 *
 * La password SMTP NON viene mai stampata.
 */

require("dotenv").config();
const {
  emailEnabled,
  emailTo,
  emailFrom,
  emailConfigIssue,
  verifyTransport,
  sendTestEmail,
} = require("../services/email");

(async () => {
  console.log("================================================");
  console.log(" 🏔️  SCI CLUB ADRANO — TEST EMAIL SMTP");
  console.log("================================================");
  console.log(`SMTP host:     ${process.env.SMTP_HOST || "(vuoto)"}`);
  console.log(`SMTP porta:    ${process.env.SMTP_PORT || "(vuoto)"}`);
  console.log(`SMTP secure:   ${process.env.SMTP_SECURE || "(vuoto)"}`);
  console.log(`SMTP user:     ${process.env.SMTP_USER || "(vuoto)"}`);
  console.log(`SMTP password: ${process.env.SMTP_PASSWORD ? "******** (impostata)" : "(vuota)"}`);
  console.log(`Da:            ${emailFrom}`);
  console.log(`A:             ${emailTo || "(vuoto)"}`);
  console.log("------------------------------------------------");

  if (!emailEnabled) {
    console.error("⚠️  Email NON configurata.");
    if (emailConfigIssue) console.error("   " + emailConfigIssue);
    console.error("   Compila SMTP_HOST / SMTP_USER / SMTP_PASSWORD / EMAIL_TO nel .env.");
    process.exitCode = 1;
    return;
  }

  console.log("Verifica connessione/autenticazione SMTP...");
  const check = await verifyTransport();
  if (!check.ok) {
    console.error("❌ Verifica SMTP fallita: " + check.error);
    process.exitCode = 1;
    return;
  }
  console.log("✅ Connessione SMTP verificata.");

  console.log("Invio email di test...");
  const result = await sendTestEmail();
  if (result.sent) {
    console.log(`✅ Email di test inviata a ${emailTo}.`);
    console.log("   Controlla la casella (anche le cartelle Spam/Promozioni).");
  } else {
    console.error("❌ Invio non riuscito: " + result.error);
    process.exitCode = 1;
  }
  console.log("================================================");
})().catch((error) => {
  console.error("❌ Errore:", error.message);
  process.exitCode = 1;
});
