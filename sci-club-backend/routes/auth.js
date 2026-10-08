"use strict";

/**
 * routes/auth.js
 * Login / logout / stato sessione per il pannello Admin.
 */

const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../config/database");
const { loginLimiter } = require("../middleware/security");
const { requireAuth } = require("../middleware/auth");
const { clean } = require("../utils/validation");

const router = express.Router();

// Hash "dummy" usato per uniformare i tempi di risposta quando
// l'utente non esiste (mitigazione timing attack / user enumeration).
const DUMMY_HASH = "$2a$12$C6UzMDM.H6dfI/f/IKcEeO0m6O2b9m4n2n5d3z0m2n5d3z0m2n5d3z0";

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

/* POST /api/auth/login */
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const username = clean(req.body && req.body.username, 60);
    const password = typeof (req.body && req.body.password) === "string" ? req.body.password : "";

    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Credenziali mancanti." });
    }

    const [rows] = await pool.query(
      "SELECT id, username, password_hash FROM admin WHERE username = ? LIMIT 1",
      [username]
    );

    const admin = rows[0];
    const hash = admin ? admin.password_hash : DUMMY_HASH;
    const passwordOk = await bcrypt.compare(password, hash);

    if (!admin || !passwordOk) {
      return res.status(401).json({ success: false, error: "Username o password non corretti." });
    }

    await regenerateSession(req);
    req.session.admin = { id: admin.id, username: admin.username };

    await pool.query("UPDATE admin SET ultimo_accesso = NOW() WHERE id = ?", [admin.id]);

    return res.json({
      success: true,
      message: "Accesso effettuato.",
      user: { username: admin.username },
    });
  } catch (error) {
    return next(error);
  }
});

/* POST /api/auth/logout */
router.post("/logout", async (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.json({ success: true, message: "Sessione già terminata." });
  }
  try {
    await destroySession(req);
  } catch {
    /* ignora: la sessione verrà comunque eliminata */
  }
  res.clearCookie("sciclub.sid");
  return res.json({ success: true, message: "Logout effettuato." });
});

/* GET /api/auth/me */
router.get("/me", requireAuth, (req, res) => {
  res.json({
    success: true,
    authenticated: true,
    user: { username: req.session.admin.username },
  });
});

module.exports = router;
