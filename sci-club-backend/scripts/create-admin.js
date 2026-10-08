"use strict";

/**
 * scripts/create-admin.js
 * Crea (o reimposta) l'account Admin in modo sicuro.
 *
 * Uso:
 *   npm run create-admin -- <username> <password>
 *   oppure imposta ADMIN_USERNAME e ADMIN_PASSWORD nel .env
 *
 * La password NON viene mai scritta in chiaro nel database:
 * viene salvata solo come hash bcrypt.
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../config/database");
const { initDatabase } = require("../database/init");

async function main() {
  const args = process.argv.slice(2);
  const username = (args[0] || process.env.ADMIN_USERNAME || "admin").trim();
  const password = args[1] || process.env.ADMIN_PASSWORD || "";

  if (!username || username.length < 3) {
    console.error("[ERRORE] Username mancante o troppo corto (min 3 caratteri).");
    process.exitCode = 1;
    return;
  }
  if (!password || password.length < 8) {
    console.error("[ERRORE] Password mancante o troppo corta (min 8 caratteri).");
    console.error("Uso: npm run create-admin -- <username> <password>");
    process.exitCode = 1;
    return;
  }

  await initDatabase();

  const hash = await bcrypt.hash(password, 12);

  const [existing] = await pool.query("SELECT id FROM admin WHERE username = ? LIMIT 1", [username]);

  if (existing.length) {
    await pool.query("UPDATE admin SET password_hash = ? WHERE id = ?", [hash, existing[0].id]);
    console.log(`[OK] Password aggiornata per l'admin "${username}".`);
  } else {
    await pool.query("INSERT INTO admin (username, password_hash) VALUES (?, ?)", [username, hash]);
    console.log(`[OK] Admin "${username}" creato.`);
  }
}

main()
  .catch((error) => {
    console.error("[ERRORE]", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
