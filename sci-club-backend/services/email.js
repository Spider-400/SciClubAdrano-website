"use strict";

/**
 * services/email.js
 * Invio email tramite Nodemailer.
 *
 * Tutte le credenziali arrivano dal .env (MAI nel codice):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD,
 *   EMAIL_FROM, EMAIL_TO.
 *
 * La password SMTP non viene mai loggata né esportata.
 */

const nodemailer = require("nodemailer");

const SMTP_HOST = (process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_USER = (process.env.SMTP_USER || "").trim();
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "Sci Club Adrano <no-reply@localhost>";
const EMAIL_TO = (process.env.EMAIL_TO || "").trim();

// Elenco delle variabili mancanti (SOLO nomi, mai valori).
const missingVars = [];
if (!SMTP_HOST) missingVars.push("SMTP_HOST");
if (!SMTP_USER) missingVars.push("SMTP_USER");
if (!SMTP_PASSWORD) missingVars.push("SMTP_PASSWORD");
if (!EMAIL_TO) missingVars.push("EMAIL_TO");

// Servizio considerato configurato solo se tutte le variabili necessarie sono presenti.
const emailEnabled = missingVars.length === 0;
const emailConfigIssue = emailEnabled ? null : `Variabili mancanti: ${missingVars.join(", ")}`;

let transporter = null;
if (emailEnabled) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    // Timeout ESPLICITI: senza questi Nodemailer usa i default (connessione
    // 2 min, socket 10 min) e una richiesta poteva restare appesa a lungo.
    // Con questi valori l'invio fallisce in fretta e non blocca il frontend.
    connectionTimeout: 15000, // 15s per stabilire la connessione TCP
    greetingTimeout: 15000, // 15s per ricevere il saluto SMTP
    socketTimeout: 30000, // 30s di inattività massima sul socket
  });
}

/* ------------------------------------------------------------------ */
/* Utilities                                                          */
/* ------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function yesNo(value) {
  return value ? "Sì" : "No";
}

function formatDateTime(d) {
  const date = d instanceof Date ? d : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Messaggio d'errore CHIARO e senza credenziali.
 * Non include mai SMTP_PASSWORD.
 */
function formatEmailError(error) {
  const code = error && error.code;
  if (code === "EAUTH") {
    return "Autenticazione SMTP rifiutata. Su Gmail usa una APP PASSWORD valida e SMTP_USER uguale all'indirizzo Gmail completo.";
  }
  if (code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ESOCKET" || code === "EDNS") {
    return "Impossibile raggiungere il server SMTP. Verifica SMTP_HOST/SMTP_PORT e la connessione.";
  }
  return (error && error.message) || "Errore SMTP sconosciuto.";
}

/* ------------------------------------------------------------------ */
/* Template tesseramento                                              */
/* ------------------------------------------------------------------ */

function renderRow(label, value) {
  return `
    <tr>
      <td style="padding:7px 14px 7px 0;color:#5b6b78;font-size:13px;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:7px 0;color:#11171e;font-size:13px;font-weight:600;">${escapeHtml(value)}</td>
    </tr>`;
}

function renderSection(title, rows) {
  return `
    <tr>
      <td style="padding:22px 0 6px;">
        <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:1.5px;color:#f15428;font-weight:700;text-transform:uppercase;">${escapeHtml(title)}</div>
        <div style="height:2px;background:#11171e;width:42px;margin-top:7px;"></div>
      </td>
    </tr>
    <tr>
      <td>
        <table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;">
          ${rows.join("")}
        </table>
      </td>
    </tr>`;
}

function tesseramentoHtml(t) {
  return `
  <!doctype html>
  <html lang="it">
    <body style="margin:0;background:#eef1f2;padding:24px;">
      <table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;width:100%;max-width:620px;margin:0 auto;background:#ffffff;">
        <tr>
          <td style="background:#11171e;padding:24px 28px;">
            <div style="font-family:Arial,sans-serif;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">🏔️ SCI CLUB ADRANO</div>
            <div style="font-family:Arial,sans-serif;color:#c1e5f1;font-size:12px;letter-spacing:2px;margin-top:4px;">NUOVA RICHIESTA DI TESSERAMENTO FISI</div>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 28px 6px;">
            <div style="font-family:Arial,sans-serif;font-size:20px;font-weight:700;color:#11171e;">${escapeHtml(t.nome)} ${escapeHtml(t.cognome)}</div>
            <div style="font-family:Arial,sans-serif;font-size:13px;color:#5b6b78;margin-top:4px;">Tessera richiesta: ${escapeHtml(t.tipo_tessera)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 28px;">
            <table cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;width:100%;">
              ${renderSection("Dati personali", [
                renderRow("Nome", t.nome),
                renderRow("Cognome", t.cognome),
                renderRow("Sesso", t.sesso),
                renderRow("Data di nascita", t.data_nascita),
                renderRow("Nazionalità", t.nazionalita),
                renderRow("Luogo di nascita", t.luogo_nascita),
                renderRow("Codice fiscale", t.codice_fiscale),
              ])}
              ${renderSection("Residenza / domicilio", [
                renderRow("Indirizzo", t.indirizzo),
                renderRow("Città", t.citta),
                renderRow("CAP", t.cap),
              ])}
              ${renderSection("Contatti", [
                renderRow("Email", t.email),
                renderRow("Telefono", t.telefono),
              ])}
              ${renderSection("Tesseramento", [
                renderRow("Precedente tessera FISI", t.precedente_tessera_fisi),
                renderRow("Tipo di tessera", t.tipo_tessera),
                renderRow("Privacy", yesNo(t.privacy_accettata)),
              ])}
              ${renderSection("Pagamento", [
                renderRow("Modalità", t.pagamento),
              ])}
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f5f6f4;padding:18px 28px;font-family:Arial,sans-serif;font-size:11px;color:#71808b;">
            Richiesta ricevuta dal modulo tesseramento FISI del sito ufficiale.<br />
            Gestibile dal pannello Admin dello Sci Club Adrano.<br />
            Ricevuta il: ${escapeHtml(formatDateTime(new Date()))}
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}

function tesseramentoText(t) {
  return [
    "SCI CLUB ADRANO — Nuova richiesta tesseramento FISI",
    "",
    "DATI PERSONALI",
    `Nome: ${t.nome}`,
    `Cognome: ${t.cognome}`,
    `Sesso: ${t.sesso}`,
    `Data di nascita: ${t.data_nascita}`,
    `Nazionalità: ${t.nazionalita}`,
    `Luogo di nascita: ${t.luogo_nascita}`,
    `Codice fiscale: ${t.codice_fiscale}`,
    "",
    "RESIDENZA / DOMICILIO",
    `Indirizzo: ${t.indirizzo}`,
    `Città: ${t.citta}`,
    `CAP: ${t.cap}`,
    "",
    "CONTATTI",
    `Email: ${t.email}`,
    `Telefono: ${t.telefono}`,
    "",
    "TESSERAMENTO",
    `Precedente tessera FISI: ${t.precedente_tessera_fisi}`,
    `Tipo di tessera: ${t.tipo_tessera}`,
    `Privacy: ${t.privacy_accettata ? "Sì" : "No"}`,
    "",
    "PAGAMENTO",
    `Modalità: ${t.pagamento}`,
    "",
    `Ricevuta il: ${formatDateTime(new Date())}`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Template messaggio contatti                                        */
/* ------------------------------------------------------------------ */

function messaggioText(m) {
  const dataStr = m.data_creazione ? String(m.data_creazione) : formatDateTime(new Date());
  return [
    "SCI CLUB ADRANO — Nuovo messaggio dal sito",
    "",
    `Nome: ${m.nome}`,
    `Email: ${m.email}`,
    `Data: ${dataStr}`,
    "",
    "Messaggio:",
    m.messaggio,
  ].join("\n");
}

function messaggioHtml(m) {
  const dataStr = m.data_creazione ? String(m.data_creazione) : formatDateTime(new Date());
  return `
    <div style="font-family:Arial,sans-serif;color:#11171e;max-width:620px;margin:0 auto;">
      <div style="background:#11171e;color:#fff;padding:18px 22px;font-weight:700;font-size:16px;">🏔️ SCI CLUB ADRANO — Nuovo messaggio</div>
      <div style="padding:22px;">
        ${renderRow("Nome", m.nome)}
        ${renderRow("Email", m.email)}
        ${renderRow("Data", dataStr)}
        <div style="margin-top:18px;">
          <div style="font-size:11px;letter-spacing:1.5px;color:#f15428;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Messaggio</div>
          <div style="white-space:pre-wrap;font-size:14px;line-height:1.65;">${escapeHtml(m.messaggio)}</div>
        </div>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Invio                                                              */
/* ------------------------------------------------------------------ */

/** Invia la notifica di un nuovo tesseramento. Ritorna { sent, error }. */
async function sendTesseramentoEmail(t) {
  if (!emailEnabled) {
    return { sent: false, error: "Servizio email non configurato." };
  }
  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: EMAIL_TO,
      subject: "[SCI CLUB ADRANO] Nuovo tesseramento FISI",
      text: tesseramentoText(t),
      html: tesseramentoHtml(t),
    });
    return { sent: true, error: null };
  } catch (error) {
    return { sent: false, error: formatEmailError(error) };
  }
}

/** Invia la notifica di un nuovo messaggio di contatto. Ritorna { sent, error }. */
async function sendMessaggioEmail(m) {
  if (!emailEnabled) {
    return { sent: false, error: "Servizio email non configurato." };
  }
  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: EMAIL_TO,
      replyTo: m.email,
      subject: "[SCI CLUB ADRANO] Nuovo messaggio dal sito",
      text: messaggioText(m),
      html: messaggioHtml(m),
    });
    return { sent: true, error: null };
  } catch (error) {
    return { sent: false, error: formatEmailError(error) };
  }
}

/** Verifica la connessione/autenticazione SMTP. Ritorna { ok, error }. */
async function verifyTransport() {
  if (!emailEnabled) {
    return { ok: false, error: "Servizio email non configurato. " + (emailConfigIssue || "") };
  }
  try {
    await transporter.verify();
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: formatEmailError(error) };
  }
}

/** Invia una singola email di prova. Ritorna { sent, error }. */
async function sendTestEmail() {
  if (!emailEnabled) {
    return { sent: false, error: "Servizio email non configurato. " + (emailConfigIssue || "") };
  }
  try {
    await transporter.sendMail({
      from: EMAIL_FROM,
      to: EMAIL_TO,
      subject: "[SCI CLUB ADRANO] Email di test",
      text: "Email di test dello Sci Club Adrano. La configurazione SMTP funziona correttamente.",
      html: `
        <div style="font-family:Arial,sans-serif;color:#11171e;max-width:620px;margin:0 auto;">
          <div style="background:#11171e;color:#fff;padding:18px 22px;font-weight:700;">🏔️ SCI CLUB ADRANO</div>
          <div style="padding:22px;">
            <p style="margin:0 0 12px;font-size:16px;font-weight:700;">Configurazione SMTP funzionante ✅</p>
            <p style="margin:0;color:#5b6b78;font-size:14px;">Questa è una email di test inviata dal backend. Destinatario: ${escapeHtml(EMAIL_TO)}.</p>
          </div>
        </div>`,
    });
    return { sent: true, error: null };
  } catch (error) {
    return { sent: false, error: formatEmailError(error) };
  }
}

module.exports = {
  emailEnabled,
  emailTo: EMAIL_TO,
  emailFrom: EMAIL_FROM,
  emailConfigIssue,
  sendTesseramentoEmail,
  sendMessaggioEmail,
  verifyTransport,
  sendTestEmail,
};
