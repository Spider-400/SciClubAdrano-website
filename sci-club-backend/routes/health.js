"use strict";

/**
 * routes/health.js
 * GET /api/health — verifica server e database.
 */

const express = require("express");
const { pingDatabase } = require("../config/database");

const router = express.Router();

router.get("/", async (req, res) => {
  const dbOk = await pingDatabase();
  res.status(dbOk ? 200 : 503).json({
    success: dbOk,
    server: "online",
    database: dbOk ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
