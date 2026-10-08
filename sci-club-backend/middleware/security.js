"use strict";

/**
 * middleware/security.js
 * Helmet, CORS e rate limiting.
 *
 * Le origini consentite vengono lette dal .env da DUE variabili
 * (entrambe ammettono più origini separate da virgola):
 *   - FRONTEND_URL          (es. sviluppo: http://localhost:3000)
 *   - FRONTEND_PUBLIC_URL   (es. produzione: https://website.sciclubadrano.workers.dev)
 *
 * Alle origini del .env si aggiunge sempre l'origine pubblica di produzione
 * definita in DEFAULT_PUBLIC_ORIGINS, così il frontend live è autorizzato
 * anche se la variabile d'ambiente non è aggiornata.
 *
 * NON viene mai usato "*": le origini sono sempre esplicite.
 */

const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

/* ------------------------------------------------------------------ */
/* Helmet — header di sicurezza + Content Security Policy              */
/* ------------------------------------------------------------------ */

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});

/* ------------------------------------------------------------------ */
/* CORS                                                               */
/* ------------------------------------------------------------------ */

/** Estrae e normalizza una lista di origini (una o più, separate da virgola). */
function parseOrigins(...values) {
  const set = new Set();
  values
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .forEach((value) => set.add(value));
  return [...set];
}

/** Origini pubbliche di produzione sempre consentite (frontend Cloudflare). */
const DEFAULT_PUBLIC_ORIGINS = [
  "https://website.sciclubadrano.workers.dev",
];

const allowedOrigins = [
  ...new Set([
    ...parseOrigins(process.env.FRONTEND_URL, process.env.FRONTEND_PUBLIC_URL),
    ...DEFAULT_PUBLIC_ORIGINS,
  ]),
];
const isProduction = process.env.NODE_ENV === "production";

const corsOptions = {
  origin(origin, callback) {
    // Richieste senza Origin (curl, same-origin, server-to-server): ammesse.
    if (!origin) return callback(null, true);

    const clean = origin.replace(/\/+$/, "");
    if (allowedOrigins.includes(clean)) return callback(null, true);

    // In sviluppo consenti qualunque localhost/127.0.0.1 (frontend locale).
    if (!isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(clean)) {
      return callback(null, true);
    }

    // Origine NON consentita: non si lancia un errore (evita 500 e log
    // rumorosi); semplicemente non vengono aggiunti gli header CORS, quindi
    // il browser blocca la risposta. NON si usa mai "*".
    if (!isProduction) {
      console.warn(`[CORS] Origine non consentita: ${clean}`);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

const corsMiddleware = cors(corsOptions);

/* ------------------------------------------------------------------ */
/* Rate limiting                                                      */
/* ------------------------------------------------------------------ */

const limitHandler = (req, res) => {
  res.status(429).json({
    success: false,
    error: "Troppe richieste. Riprova tra qualche minuto.",
  });
};

// Limite generale su tutte le API.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

// Limite severo sul login (protezione brute force).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

// Limite sui moduli pubblici (FISI e contatti).
const formLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

module.exports = {
  helmetMiddleware,
  corsMiddleware,
  globalLimiter,
  loginLimiter,
  formLimiter,
  allowedOrigins,
};
