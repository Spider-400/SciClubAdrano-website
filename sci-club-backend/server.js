"use strict";

/**
 * server.js — A.S.D. SCI CLUB ADRANO · BACKEND
 * Node.js + Express + MariaDB
 *
 * Ordine di avvio:
 *  1. connessione a MariaDB SENZA database
 *  2. verifica esistenza database
 *  3. creazione database se mancante (mai DROP)
 *  4. connessione al database
 *  5. creazione tabelle mancanti
 *
 * Avvio:
 *   npm install
 *   npm start        (oppure npm run dev)
 */

require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");

const {
  pool,
  createBootstrapConnection,
  assertDatabaseReachable,
  describeConnectionError,
  DB_NAME,
} = require("./config/database");
const {
  ensureInitialAdmin,
  verifyOrCreateDatabase,
  createTablesIfNeeded,
} = require("./database/init");
const security = require("./middleware/security");
const { emailEnabled, emailTo, emailConfigIssue } = require("./services/email");

const healthRouter = require("./routes/health");
const authRouter = require("./routes/auth");
const fisiRouter = require("./routes/fisi");
const tesseramentiRouter = require("./routes/tesseramenti");
const messagesRouter = require("./routes/messages");
const statsRouter = require("./routes/stats");

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";
const baseUrl = `http://localhost:${PORT}`;

function printHeader() {
  const line = "=".repeat(56);
  console.log(line);
  console.log("        🏔️  SCI CLUB ADRANO — BACKEND");
  console.log(line);
}

/**
 * Stampa un errore di connessione al database.
 * In sviluppo mostra codice/messaggio/host/porta/utente (MAI la password).
 * In produzione mostra solo un messaggio generico.
 */
function printDatabaseError(error, title) {
  console.error("");
  console.error(`[ERRORE] ${title || "Connessione a MariaDB fallita"}.`);
  if (isProduction) {
    console.error("  Verifica che MariaDB sia avviato e che DB_* nel .env siano corretti.");
    return;
  }

  const info = describeConnectionError(error);
  console.error(`  Codice:    ${info.code}`);
  console.error(`  Messaggio: ${info.message}`);
  console.error(`  Host:      ${info.host}:${info.port}`);
  console.error(`  Utente:    ${info.user}`);
  console.error("  Password:  ******** (mai mostrata)");

  const hints = {
    ER_ACCESS_DENIED_ERROR: "Controlla DB_USER e DB_PASSWORD nel file .env.",
    ER_NOT_SUPPORTED_AUTH_MODE:
      "L'utente usa un plugin di autenticazione non supportato. Crea un utente dedicato (vedi README).",
    ER_BAD_DB_ERROR: `Il database "${DB_NAME}" non esiste e non è stato possibile crearlo.`,
    ECONNREFUSED: "Il servizio MariaDB non è in ascolto su questo host/porta. Avvialo.",
    ENOTFOUND: "L'host DB_HOST non è risolvibile.",
    EAI_AGAIN: "Risoluzione DNS temporaneamente fallita per DB_HOST.",
    ETIMEDOUT: "Timeout di connessione: MariaDB non risponde.",
  };
  if (hints[info.code]) {
    console.error(`  Suggerimento: ${hints[info.code]}`);
  }
}

function printFooter(adminCreated) {
  console.log("");
  console.log("-".repeat(56));
  console.log(`Server:       ${baseUrl}`);
  console.log(`Admin:        ${baseUrl}/admin`);
  console.log(`Health:       GET  /api/health`);
  console.log(`FISI:         POST /api/fisi`);
  console.log(`Tesseramenti: GET  /api/tesseramenti`);
  console.log(`Messaggi:     GET  /api/messages`);
  console.log("-".repeat(56));
  if (emailEnabled) {
    console.log("✅ Email configurata — destinatario:");
    console.log(`   ${emailTo}`);
  } else {
    console.log("⚠️  Email NON configurata.");
    if (emailConfigIssue) console.log(`   ${emailConfigIssue}`);
    console.log("   Database OK — i dati vengono comunque salvati e visibili in Admin.");
  }
  if (adminCreated) {
    console.log("🔐 Account Admin iniziale creato dalle variabili .env.");
  }
  console.log("=".repeat(56));
  console.log("");
  console.log("Server pronto.");
}

/**
 * Fase database: bootstrap -> verifica/crea DB -> connetti -> tabelle.
 * Esce con codice 1 e dettagli se una fase fallisce.
 */
async function prepareDatabase() {
  // --- Fase 1: connessione a MariaDB SENZA database -------------------
  console.log("[..] Connessione a MariaDB (senza database)...");
  let bootstrap;
  try {
    bootstrap = await createBootstrapConnection();
  } catch (error) {
    printDatabaseError(error, "Impossibile connettersi a MariaDB");
    process.exit(1);
  }
  console.log("[OK] MariaDB rilevato");

  // --- Fase 2/3: verifica e creazione del database --------------------
  console.log(`[..] Verifica database "${DB_NAME}"...`);
  let dbInfo;
  try {
    dbInfo = await verifyOrCreateDatabase(bootstrap);
  } catch (error) {
    await bootstrap.end().catch(() => {});
    printDatabaseError(error, `Verifica/creazione database "${DB_NAME}" fallita`);
    process.exit(1);
  }
  await bootstrap.end().catch(() => {});
  console.log(
    dbInfo.created
      ? `[OK] Database "${DB_NAME}" creato`
      : `[OK] Database "${DB_NAME}" già presente`
  );

  // --- Fase 4: connessione al database --------------------------------
  console.log("[..] Connessione al database...");
  try {
    await assertDatabaseReachable();
  } catch (error) {
    printDatabaseError(error, `Connessione al database "${DB_NAME}" fallita`);
    process.exit(1);
  }
  console.log(`[OK] Database ${DB_NAME} connesso`);

  // --- Fase 5: creazione tabelle mancanti -----------------------------
  console.log("[..] Verifica tabelle...");
  try {
    await createTablesIfNeeded();
  } catch (error) {
    printDatabaseError(error, "Creazione/verifica tabelle fallita");
    process.exit(1);
  }
  console.log("[OK] Tabelle verificate/create");
}

async function start() {
  printHeader();

  await prepareDatabase();

  // --- Account admin iniziale -----------------------------------------
  const adminResult = await ensureInitialAdmin();
  if (!adminResult.created && adminResult.reason === "password-non-impostata") {
    console.log("[i]  Nessun Admin presente: usa 'npm run create-admin' per crearne uno.");
  }

  // --- App -------------------------------------------------------------
  const app = express();
  app.disable("x-powered-by");

  if (process.env.TRUST_PROXY === "true" || isProduction) {
    app.set("trust proxy", 1);
  }

  // --- Log richieste API (solo sviluppo) -------------------------------
  // Registrato PRIMA di CORS così vengono loggate anche le richieste
  // preflight OPTIONS (che vengono concluse direttamente dal middleware CORS).
  //   [API] OPTIONS /api/fisi -> 204 (2ms)
  //   [API] POST /api/fisi -> 201 (12ms)
  if (!isProduction) {
    app.use((req, res, next) => {
      if (!req.path.startsWith("/api/")) return next();
      // Il percorso va catturato ORA: al "finish" i router hanno già riscritto req.url.
      const routePath = req.path; // senza query string -> nessun dato personale nei log
      const startedAt = Date.now();
      res.on("finish", () => {
        console.log(
          `[API] ${req.method} ${routePath} -> ${res.statusCode} (${Date.now() - startedAt}ms)`
        );
      });
      next();
    });
  }

  app.use(security.helmetMiddleware);
  app.use(security.corsMiddleware);
  app.use(security.globalLimiter);
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "100kb" }));

  // --- Sessione --------------------------------------------------------
  const sessionSecret = process.env.SESSION_SECRET || "";
  if (!sessionSecret || sessionSecret.length < 16) {
    console.warn(
      "[ATTENZIONE] SESSION_SECRET debole o mancante. Imposta un valore lungo e casuale nel .env."
    );
  }

  app.use(
    session({
      name: "sciclub.sid",
      secret: sessionSecret || "dev-only-insecure-secret",
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: process.env.COOKIE_SAMESITE || "lax",
        secure: process.env.COOKIE_SECURE === "true" || isProduction,
        maxAge: 8 * 60 * 60 * 1000,
      },
    })
  );

  // --- API -------------------------------------------------------------
  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/fisi", fisiRouter);
  app.use("/api/tesseramenti", tesseramentiRouter);
  app.use("/api/contact", messagesRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/stats", statsRouter);

  // --- Pannello Admin (statico) ---------------------------------------
  // Il pannello viene servito su "/admin/" (slash finale): in questo modo i
  // percorsi relativi di index.html ("admin.css", "admin.js") risolvono in
  // "/admin/admin.css" e "/admin/admin.js", cioè sotto il mount express.static.
  // "/admin" (senza slash) viene reindirizzato a "/admin/".
  const adminDir = path.join(__dirname, "admin");
  app.get("/", (req, res) => res.redirect("/admin/"));
  // Nota: si usa una RegExp per intercettare SOLO "/admin" (senza slash finale).
  // Con il routing di default, la stringa "/admin" matcherebbe anche "/admin/",
  // creando un redirect infinito su se stessa.
  app.get(/^\/admin$/, (req, res) => res.redirect(301, "/admin/"));
  app.use("/admin", express.static(adminDir, { index: "index.html" }));

  // --- Frontend statico locale (SOLO in sviluppo) ----------------------
  // Consente di aprire sito e modulo FISI direttamente dal backend:
  //   http://localhost:3000/tesseramento-fisi.html
  // In produzione (NODE_ENV=production) questo blocco è disattivo: il
  // frontend resta pubblicato separatamente su Cloudflare.
  if (!isProduction) {
    const frontendDir = path.resolve(__dirname, "..");
    // Protegge la cartella del backend (codice, .env, node_modules).
    app.use((req, res, next) => {
      if (req.path === "/sci-club-backend" || req.path.startsWith("/sci-club-backend/")) {
        return res.status(404).send("Not found");
      }
      next();
    });
    app.use(
      express.static(frontendDir, {
        index: false,
        dotfiles: "ignore",
        setHeaders(res, filePath) {
          // Evita JS/CSS in cache durante lo sviluppo e i test.
          if (/\.(html|js|css)$/i.test(filePath)) {
            res.setHeader("Cache-Control", "no-cache");
          }
        },
      })
    );
  }

  // --- 404 e gestione errori ------------------------------------------
  app.use((req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ success: false, error: "Endpoint non trovato." });
    }
    return res.status(404).send("Pagina non trovata.");
  });

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    // Log tecnico interno, senza esporre stack trace al client.
    console.error(`[ERRORE] ${req.method} ${req.originalUrl}: ${error.message}`);
    if (res.headersSent) return;
    res.status(error.status || 500).json({
      success: false,
      error: "Errore interno del server.",
    });
  });

  // --- Avvio -----------------------------------------------------------
  const server = app.listen(PORT, () => {
    printFooter(adminResult.created);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`[ERRORE] La porta ${PORT} è già in uso.`);
    } else {
      console.error("[ERRORE] Avvio server fallito:", error.message);
    }
    process.exit(1);
  });

  const shutdown = async (signal) => {
    console.log(`\n[${signal}] Arresto in corso...`);
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((error) => {
  console.error("[ERRORE FATALE]", error.message);
  process.exit(1);
});
