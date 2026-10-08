"use strict";

/**
 * middleware/auth.js
 * Protegge le rotte Admin: richiede una sessione autenticata.
 */

function requireAuth(req, res, next) {
  if (req.session && req.session.admin && req.session.admin.id) {
    return next();
  }
  return res.status(401).json({
    success: false,
    error: "Autenticazione richiesta.",
  });
}

module.exports = { requireAuth };
