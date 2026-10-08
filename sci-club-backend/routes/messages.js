"use strict";

/**
 * routes/messages.js
 * POST  /api/contact           — modulo contatti pubblico (nome, email, messaggio)
 * GET   /api/messages          — elenco messaggi            (Admin, protetto)
 * GET   /api/messages/:id      — dettaglio messaggio        (Admin, protetto)
 * PATCH /api/messages/:id/read — segna come letto           (Admin, protetto)
 * PATCH /api/messages/:id      — cambia stato (letto/archiviato) (Admin, protetto)
 *
 * Lo stato letto/non letto è persistito nel database nella colonna
 * `messaggi.stato`: 'nuovo' = non letto, 'letto' = letto, 'archiviato' = archiviato.
 */

const express = require("express");
const { pool } = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const { formLimiter } = require("../middleware/security");
const { validateMessaggio, STATI_MESSAGGIO } = require("../utils/validation");
const { sendMessaggioEmail } = require("../services/email");

const router = express.Router();

/**
 * Invia la notifica email in background, SENZA bloccare la risposta HTTP.
 * Il messaggio è già salvato: se l'email fallisce, il record resta in Admin.
 */
function queueMessaggioEmail(id, payload) {
  sendMessaggioEmail(payload)
    .then((email) => {
      if (!email.sent) {
        console.error(`[EMAIL] Messaggio id=${id} non inviato: ${email.error}`);
      }
    })
    .catch((error) => {
      console.error(
        `[EMAIL] Errore imprevisto per messaggio id=${id}: ${error.message}`
      );
    });
}

/* ------------------------------------------------------------------ */
/* POST / (montato su /api/contact) — pubblico                        */
/* ------------------------------------------------------------------ */
router.post("/", formLimiter, async (req, res, next) => {
  try {
    const { valid, errors, data } = validateMessaggio(req.body);
    if (!valid) {
      return res.status(400).json({ success: false, error: "Dati non validi.", fields: errors });
    }

    const [result] = await pool.query(
      "INSERT INTO messaggi (nome, email, messaggio) VALUES (?, ?, ?)",
      [data.nome, data.email, data.messaggio]
    );

    // Timestamp reale dal database, usato nel corpo dell'email ("Data").
    const [rows] = await pool.query(
      "SELECT data_creazione FROM messaggi WHERE id = ? LIMIT 1",
      [result.insertId]
    );
    const dataCreazione = rows.length ? rows[0].data_creazione : null;

    // L'email non deve bloccare la risposta HTTP: invio in background.
    queueMessaggioEmail(result.insertId, { ...data, data_creazione: dataCreazione });

    return res.status(201).json({
      success: true,
      message: "Messaggio ricevuto. Grazie!",
    });
  } catch (error) {
    return next(error);
  }
});

/* ------------------------------------------------------------------ */
/* GET / (montato su /api/messages) — protetto                        */
/* ------------------------------------------------------------------ */
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const stato = String(req.query.stato || "").trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const where = [];
    const params = [];
    if (STATI_MESSAGGIO.includes(stato)) {
      where.push("stato = ?");
      params.push(stato);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT id, nome, email, messaggio, stato, data_creazione
         FROM messaggi ${whereSql}
        ORDER BY data_creazione DESC, id DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[counts]] = await pool.query(
      "SELECT COUNT(*) AS totale, SUM(stato = 'nuovo') AS non_letti FROM messaggi"
    );

    res.json({
      success: true,
      count: rows.length,
      totale: Number(counts.totale) || 0,
      non_letti: Number(counts.non_letti) || 0,
      items: rows,
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* GET /:id — dettaglio (protetto)                                    */
/* ------------------------------------------------------------------ */
router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "ID non valido." });
    }

    const [rows] = await pool.query(
      "SELECT id, nome, email, messaggio, stato, data_creazione FROM messaggi WHERE id = ? LIMIT 1",
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Messaggio non trovato." });
    }

    res.json({ success: true, item: rows[0] });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* PATCH /:id/read — segna come letto (protetto)                      */
/* ------------------------------------------------------------------ */
router.patch("/:id/read", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "ID non valido." });
    }

    const [rows] = await pool.query("SELECT id, stato FROM messaggi WHERE id = ? LIMIT 1", [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Messaggio non trovato." });
    }

    // Non "de-archivia" un messaggio: diventa 'letto' solo se era 'nuovo'.
    if (rows[0].stato === "nuovo") {
      await pool.query("UPDATE messaggi SET stato = 'letto' WHERE id = ?", [id]);
    }

    res.json({ success: true, message: "Messaggio segnato come letto." });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------------ */
/* PATCH /:id — cambia stato (protetto)                               */
/* ------------------------------------------------------------------ */
router.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "ID non valido." });
    }

    const stato = String((req.body && req.body.stato) || "").trim();
    if (!STATI_MESSAGGIO.includes(stato)) {
      return res.status(400).json({ success: false, error: "Stato non valido." });
    }

    const [result] = await pool.query("UPDATE messaggi SET stato = ? WHERE id = ?", [stato, id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: "Messaggio non trovato." });
    }

    res.json({ success: true, message: "Messaggio aggiornato." });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
