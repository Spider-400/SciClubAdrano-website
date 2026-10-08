"use strict";

/**
 * config/database.js
 * Connessione MariaDB/MySQL tramite mysql2 con pool di connessioni.
 * Tutte le credenziali arrivano dal file .env — mai scritte nel codice.
 *
 * IMPORTANTE — ordine di connessione:
 *  1. `createBootstrapConnection()` collega a MariaDB SENZA database.
 *     Serve a verificare/creare il database `sci_club_adrano`.
 *  2. `pool` è già puntato al database scelto (usato a runtime dalle rotte).
 *     Va usato SOLO dopo che il database esiste.
 */

require("dotenv").config();
const mysql = require("mysql2/promise");

const DB_NAME = process.env.DB_NAME || "sci_club_adrano";

// Sicurezza: il nome del database viene interpolato come identificatore
// nelle query DDL, quindi accettiamo solo caratteri sicuri.
if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
  throw new Error(
    "DB_NAME non valido: sono ammessi solo lettere, numeri e underscore."
  );
}

const connectionConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  charset: "utf8mb4",
  dateStrings: true,
};

const poolConfig = {
  ...connectionConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Pool "di lavoro": punta al database. Da usare solo dopo che esiste.
const pool = mysql.createPool({ ...poolConfig, database: DB_NAME });

/**
 * Connessione "di bootstrap" SENZA database selezionato.
 * È il primo passo dell'avvio: permette di creare il database.
 */
async function createBootstrapConnection() {
  return mysql.createConnection(connectionConfig);
}

/**
 * Verifica rapida e NON bloccante di raggiungibilità del database.
 * Ritorna true/false senza lanciare eccezioni (usato da /api/health).
 */
async function pingDatabase() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica "strict" del pool: lancia l'errore reale se la connessione
 * al database non è possibile (usato all'avvio per mostrare la causa).
 */
async function assertDatabaseReachable() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

/**
 * Estrae informazioni SICURE da un errore di connessione.
 * La password non è mai inclusa.
 */
function describeConnectionError(error) {
  const err = error || {};
  return {
    code: err.code || (err.errno !== undefined ? `errno ${err.errno}` : "UNKNOWN"),
    message: err.sqlMessage || err.message || String(error),
    host: connectionConfig.host,
    port: connectionConfig.port,
    user: connectionConfig.user,
  };
}

module.exports = {
  pool,
  createBootstrapConnection,
  pingDatabase,
  assertDatabaseReachable,
  describeConnectionError,
  connectionConfig,
  DB_NAME,
};
