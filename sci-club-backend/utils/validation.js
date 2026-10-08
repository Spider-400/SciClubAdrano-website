"use strict";

/**
 * utils/validation.js
 * Validazione e normalizzazione dei dati in ingresso.
 * La validazione frontend NON è sufficiente: tutto viene ricontrollato qui.
 */

const TIPI_TESSERA = [
  "Civile Adulto — € 40",
  "Civile Bambino (sotto i 10 anni) — € 20",
  "Militare (G.S.N.M.S.) — € 30",
];

const STATI_TESSERAMENTO = ["nuovo", "in_elaborazione", "completato", "annullato"];
const STATI_MESSAGGIO = ["nuovo", "letto", "archiviato"];

/**
 * Pulizia MINIMA e non trasformativa.
 * - rimuove solo i caratteri di controllo (tranne TAB/NEWLINE/CR)
 * - rimuove spazi iniziali/finali
 * - NON cambia mai il caso (mai toLowerCase/toUpperCase)
 * - NON comprime gli spazi né le righe interne: il valore resta quello digitato
 */
function clean(value, maxLength) {
  if (value === undefined || value === null) return "";
  let out = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (maxLength && out.length > maxLength) out = out.slice(0, maxLength);
  return out;
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 160;
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00");
  return !Number.isNaN(date.getTime());
}

function ageFromIsoDate(value) {
  const birth = new Date(value + "T00:00:00");
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

/* ------------------------------------------------------------------ */
/* Tesseramento FISI                                                   */
/* ------------------------------------------------------------------ */

function validateTesseramento(body = {}) {
  const errors = {};

  const data = {
    nome: clean(body.nome, 80),
    cognome: clean(body.cognome, 80),
    sesso: clean(body.sesso, 1),
    data_nascita: clean(body.dataNascita, 10),
    nazionalita: clean(body.nazionalita, 60),
    luogo_nascita: clean(body.luogoNascita, 120),
    codice_fiscale: clean(body.codiceFiscale, 16),
    indirizzo: clean(body.indirizzo, 160),
    citta: clean(body.citta, 100),
    cap: clean(body.cap, 5),
    email: clean(body.email, 160),
    telefono: clean(body.telefono, 30),
    precedente_tessera_fisi: clean(body.precedente, 2),
    tipo_tessera: clean(body.tipoTessera, 120),
    pagamento: clean(body.pagamento, 190),
    privacy_accettata: body.privacy === true || body.privacy === "on" || body.privacy === "true" ? 1 : 0,
  };

  // Lettere (anche accentate), cifre, spazi, apostrofo, trattino, punto.
  // Nessun carattere speciale HTML/quote: i valori sono poi escapati in uscita.
  const nomeRe = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9' .-]+$/;
  if (data.nome.length < 2) errors.nome = "Il nome è obbligatorio (min 2 caratteri).";
  else if (!nomeRe.test(data.nome)) errors.nome = "Il nome contiene caratteri non validi.";

  if (data.cognome.length < 2) errors.cognome = "Il cognome è obbligatorio (min 2 caratteri).";
  else if (!nomeRe.test(data.cognome)) errors.cognome = "Il cognome contiene caratteri non validi.";

  if (!["M", "F"].includes(data.sesso)) errors.sesso = "Il sesso deve essere M o F.";

  if (!isIsoDate(data.data_nascita)) {
    errors.dataNascita = "Inserisci una data di nascita valida.";
  } else {
    const age = ageFromIsoDate(data.data_nascita);
    if (age < 0) errors.dataNascita = "La data di nascita non può essere nel futuro.";
    else if (age > 120) errors.dataNascita = "Data di nascita non plausibile.";
  }

  if (data.nazionalita.length < 2) errors.nazionalita = "La nazionalità è obbligatoria.";

  if (data.luogo_nascita.length < 2) errors.luogoNascita = "Il luogo di nascita è obbligatorio.";

  // Case-insensitive: il codice fiscale viene salvato ESATTAMENTE come digitato.
  if (!/^[A-Za-z0-9]{16}$/.test(data.codice_fiscale)) {
    errors.codiceFiscale = "Il codice fiscale deve contenere 16 caratteri alfanumerici.";
  }

  if (data.indirizzo.length < 3) errors.indirizzo = "L'indirizzo è obbligatorio.";

  if (data.citta.length < 2) errors.citta = "La città è obbligatoria.";

  if (!/^\d{5}$/.test(data.cap)) errors.cap = "Il CAP deve contenere 5 cifre.";

  if (!isEmail(data.email)) errors.email = "Inserisci un indirizzo email valido.";

  if (!/^[0-9+\s().-]{6,30}$/.test(data.telefono)) {
    errors.telefono = "Inserisci un numero di telefono valido.";
  }

  if (!["SI", "NO"].includes(data.precedente_tessera_fisi)) {
    errors.precedente = "Indica se possiedi una precedente tessera FISI.";
  }

  if (!TIPI_TESSERA.includes(data.tipo_tessera)) {
    errors.tipoTessera = "Seleziona un tipo di tessera valido.";
  }

  if (data.pagamento.length < 1) errors.pagamento = "Indica la modalità di pagamento.";

  if (data.privacy_accettata !== 1) {
    errors.privacy = "È necessario accettare l'informativa privacy.";
  }

  return { valid: Object.keys(errors).length === 0, errors, data };
}

/* ------------------------------------------------------------------ */
/* Messaggi di contatto                                                */
/* ------------------------------------------------------------------ */

function validateMessaggio(body = {}) {
  const errors = {};

  const data = {
    nome: clean(body.nome, 80),
    email: clean(body.email, 160),
    messaggio: clean(body.messaggio, 3000),
  };

  if (data.nome.length < 2) errors.nome = "Il nome è obbligatorio.";
  if (!isEmail(data.email)) errors.email = "Inserisci un indirizzo email valido.";
  if (data.messaggio.length < 10) errors.messaggio = "Il messaggio deve contenere almeno 10 caratteri.";
  else if (data.messaggio.length > 3000) errors.messaggio = "Il messaggio è troppo lungo.";

  return { valid: Object.keys(errors).length === 0, errors, data };
}

module.exports = {
  TIPI_TESSERA,
  STATI_TESSERAMENTO,
  STATI_MESSAGGIO,
  clean,
  isEmail,
  validateTesseramento,
  validateMessaggio,
};
