"use strict";

/**
 * routes/fisi.js
 * POST /api/fisi — riceve una richiesta di tesseramento FISI.
 *
 * Flusso:
 *  1. valida i dati
 *  2. salva il record nel database
 *  3. invia la notifica email (se configurata)
 *  4. restituisce JSON
 *
 * Se l'email fallisce il record resta salvato (email_inviata = 0)
 * e l'Admin può vederlo nel pannello. Nessun dato personale nei log.
 */

const express = require("express");
const { pool } = require("../config/database");
const { formLimiter } = require("../middleware/security");
const { validateTesseramento } = require("../utils/validation");
const { sendTesseramentoEmail } = require("../services/email");

const router = express.Router();

const INSERT_SQL = `
  INSERT INTO tesseramenti (
    nome, cognome, sesso, data_nascita, nazionalita, luogo_nascita,
    codice_fiscale, indirizzo, citta, cap, email, telefono,
    precedente_tessera_fisi, tipo_tessera, pagamento, privacy_accettata
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

router.post("/", formLimiter, async (req, res, next) => {
  try {
    const { valid, errors, data } = validateTesseramento(req.body);

    if (!valid) {
      return res.status(400).json({
        success: false,
        error: "Alcuni campi non sono validi.",
        fields: errors,
      });
    }

    const params = [
      data.nome,
      data.cognome,
      data.sesso,
      data.data_nascita,
      data.nazionalita,
      data.luogo_nascita,
      data.codice_fiscale,
      data.indirizzo,
      data.citta,
      data.cap,
      data.email,
      data.telefono,
      data.precedente_tessera_fisi,
      data.tipo_tessera,
      data.pagamento,
      data.privacy_accettata,
    ];

    const [result] = await pool.query(INSERT_SQL, params);
    const id = result.insertId;

    const email = await sendTesseramentoEmail(data);
    if (email.sent) {
      await pool.query("UPDATE tesseramenti SET email_inviata = 1 WHERE id = ?", [id]);
    } else {
      console.error(
        `[EMAIL] Invio non riuscito per tesseramento id=${id}: ${email.error}`
      );
    }

    return res.status(201).json({
      success: true,
      message: "Richiesta di tesseramento ricevuta.",
      emailSent: email.sent,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
