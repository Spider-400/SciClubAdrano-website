"use strict";

/**
 * routes/tesseramenti.js
 * Gestione tesseramenti per il pannello Admin.
 * Tutte le rotte sono protette da autenticazione.
 */

const express = require("express");
const { pool } = require("../config/database");
const { requireAuth } = require("../middleware/auth");
const { STATI_TESSERAMENTO, clean } = require("../utils/validation");

const router = express.Router();

router.use(requireAuth);

/* GET /api/tesseramenti — elenco (con filtri e paginazione) */
router.get("/", async (req, res, next) => {
  try {
    const stato = clean(req.query.stato, 30);
    const search = clean(req.query.search, 80);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const where = [];
    const params = [];

    if (STATI_TESSERAMENTO.includes(stato)) {
      where.push("stato = ?");
      params.push(stato);
    }
    if (search) {
      where.push("(nome LIKE ? OR cognome LIKE ? OR email LIKE ? OR codice_fiscale LIKE ?)");
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT id, nome, cognome, tipo_tessera, email, stato, email_inviata, data_creazione
       FROM tesseramenti
       ${whereSql}
       ORDER BY data_creazione DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM tesseramenti ${whereSql}`,
      params
    );

    res.json({ success: true, total, count: rows.length, items: rows });
  } catch (error) {
    next(error);
  }
});

/* GET /api/tesseramenti/:id — dettaglio completo */
router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "ID non valido." });
    }

    const [rows] = await pool.query("SELECT * FROM tesseramenti WHERE id = ? LIMIT 1", [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: "Tesseramento non trovato." });
    }

    res.json({ success: true, item: rows[0] });
  } catch (error) {
    next(error);
  }
});

/* PATCH /api/tesseramenti/:id — aggiorna stato e note */
router.patch("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "ID non valido." });
    }

    const stato = clean(req.body && req.body.stato, 30);
    if (!STATI_TESSERAMENTO.includes(stato)) {
      return res.status(400).json({ success: false, error: "Stato non valido." });
    }

    const hasNote = req.body && Object.prototype.hasOwnProperty.call(req.body, "note_admin");
    const note = hasNote ? clean(req.body.note_admin, 2000) : null;

    const [result] = hasNote
      ? await pool.query("UPDATE tesseramenti SET stato = ?, note_admin = ? WHERE id = ?", [
          stato,
          note,
          id,
        ])
      : await pool.query("UPDATE tesseramenti SET stato = ? WHERE id = ?", [stato, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: "Tesseramento non trovato." });
    }

    res.json({ success: true, message: "Tesseramento aggiornato." });
  } catch (error) {
    next(error);
  }
});

/* DELETE /api/tesseramenti/:id — eliminazione con conferma esplicita */
router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, error: "ID non valido." });
    }

    if (!(req.body && req.body.confirm === true)) {
      return res.status(400).json({
        success: false,
        error: "Eliminazione non confermata.",
      });
    }

    const [result] = await pool.query("DELETE FROM tesseramenti WHERE id = ?", [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: "Tesseramento non trovato." });
    }

    res.json({ success: true, message: "Tesseramento eliminato." });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
