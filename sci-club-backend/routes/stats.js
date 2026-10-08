"use strict";

/**
 * routes/stats.js
 * GET /api/stats — statistiche per la dashboard Admin.
 * I numeri arrivano esclusivamente dal database.
 */

const express = require("express");
const { pool } = require("../config/database");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const [[tess]] = await pool.query(`
      SELECT
        COUNT(*) AS totale,
        SUM(stato = 'nuovo') AS nuovi,
        SUM(stato = 'in_elaborazione') AS in_elaborazione,
        SUM(stato = 'completato') AS completati,
        SUM(stato = 'annullato') AS annullati,
        SUM(email_inviata = 0) AS email_fallite,
        MAX(data_creazione) AS ultima_richiesta
      FROM tesseramenti
    `);

    const [[msg]] = await pool.query(`
      SELECT
        COUNT(*) AS totale,
        SUM(stato = 'nuovo') AS nuovi
      FROM messaggi
    `);

    res.json({
      success: true,
      tesseramenti: {
        totale: Number(tess.totale) || 0,
        nuovi: Number(tess.nuovi) || 0,
        in_elaborazione: Number(tess.in_elaborazione) || 0,
        completati: Number(tess.completati) || 0,
        annullati: Number(tess.annullati) || 0,
        email_fallite: Number(tess.email_fallite) || 0,
        ultima_richiesta: tess.ultima_richiesta || null,
      },
      messaggi: {
        totale: Number(msg.totale) || 0,
        nuovi: Number(msg.nuovi) || 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
