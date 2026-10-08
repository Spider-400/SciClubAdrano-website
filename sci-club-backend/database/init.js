"use strict";

/**
 * database/init.js
 * Inizializzazione NON distruttiva del database.
 *
 * Ordine corretto:
 *  1. connessione a MariaDB SENZA database (bootstrap)
 *  2. verifica se il database esiste
 *  3. se non esiste -> CREATE DATABASE IF NOT EXISTS
 *  4. connessione al database (pool già puntato a DB_NAME)
 *  5. CREATE TABLE IF NOT EXISTS per ogni tabella
 *
 * NON esegue mai DROP DATABASE / DROP TABLE e non cancella dati.
 *
 * Usabile:
 *  - importato da server.js all'avvio
 *  - da terminale:  npm run init-db
 */

require("dotenv").config();
const bcrypt = require("bcryptjs");
const {
  pool,
  createBootstrapConnection,
  DB_NAME,
} = require("../config/database");

/* ------------------------------------------------------------------ */
/* Schema tabelle                                                      */
/* ------------------------------------------------------------------ */

const CREATE_TESSERAMENTI = `
CREATE TABLE IF NOT EXISTS tesseramenti (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(80) NOT NULL,
  cognome VARCHAR(80) NOT NULL,
  sesso ENUM('M','F') NOT NULL,
  data_nascita DATE NOT NULL,
  nazionalita VARCHAR(60) NOT NULL,
  luogo_nascita VARCHAR(120) NOT NULL,
  codice_fiscale CHAR(16) NOT NULL,
  indirizzo VARCHAR(160) NOT NULL,
  citta VARCHAR(100) NOT NULL,
  cap CHAR(5) NOT NULL,
  email VARCHAR(160) NOT NULL,
  telefono VARCHAR(30) NOT NULL,
  precedente_tessera_fisi ENUM('SI','NO') NOT NULL,
  tipo_tessera VARCHAR(120) NOT NULL,
  pagamento VARCHAR(190) NOT NULL,
  privacy_accettata TINYINT(1) NOT NULL DEFAULT 0,
  stato ENUM('nuovo','in_elaborazione','completato','annullato') NOT NULL DEFAULT 'nuovo',
  email_inviata TINYINT(1) NOT NULL DEFAULT 0,
  note_admin TEXT NULL,
  data_creazione DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  data_aggiornamento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stato (stato),
  KEY idx_data_creazione (data_creazione),
  KEY idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const CREATE_MESSAGGI = `
CREATE TABLE IF NOT EXISTS messaggi (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(80) NOT NULL,
  email VARCHAR(160) NOT NULL,
  messaggio TEXT NOT NULL,
  stato ENUM('nuovo','letto','archiviato') NOT NULL DEFAULT 'nuovo',
  data_creazione DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_stato (stato),
  KEY idx_data_creazione (data_creazione)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const CREATE_ADMIN = `
CREATE TABLE IF NOT EXISTS admin (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(60) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  data_creazione DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ultimo_accesso DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

/* ------------------------------------------------------------------ */
/* Funzioni                                                        */
/* ------------------------------------------------------------------ */

/** Controlla nel catalogo se il database esiste già. */
async function databaseExists(conn) {
  const [rows] = await conn.query(
    "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT 1",
    [DB_NAME]
  );
  return rows.length > 0;
}

/**
 * Verifica l'esistenza del database e lo crea se manca.
 * Riceve una connessione bootstrap (senza database).
 * Ritorna { existed, created }.
 */
async function verifyOrCreateDatabase(conn) {
  if (await databaseExists(conn)) {
    return { existed: true, created: false };
  }
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  return { existed: false, created: true };
}

/** Crea un database dedicato con la propria connessione bootstrap. */
async function createDatabaseIfNeeded() {
  const conn = await createBootstrapConnection();
  try {
    return await verifyOrCreateDatabase(conn);
  } finally {
    await conn.end();
  }
}

/** Verifica se una colonna esiste (idempotente). */
async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [DB_NAME, table, column]
  );
  return rows[0].n > 0;
}

/**
 * Migrazioni idempotenti e NON distruttive.
 * Non esegue mai DROP/DELETE: aggiunge solo colonne mancanti.
 *
 * La gestione letto/non letto è affidata alla colonna esistente
 * `messaggi.stato`:
 *   - 'nuovo'      = NON LETTO
 *   - 'letto'      = LETTO
 *   - 'archiviato' = archiviato (considerato letto)
 * La migrazione si limita a garantirne l'esistenza (per DB legacy).
 */
async function runMigrations() {
  if (!(await columnExists("messaggi", "stato"))) {
    await pool.query(
      "ALTER TABLE messaggi ADD COLUMN stato ENUM('nuovo','letto','archiviato') NOT NULL DEFAULT 'nuovo' AFTER messaggio"
    );
    console.log("[OK] Migrazione: aggiunta colonna messaggi.stato (letto/non letto)");
  }
}

/** Crea le tabelle mancanti sul database (pool già connesso). */
async function createTablesIfNeeded() {
  await pool.query(CREATE_TESSERAMENTI);
  await pool.query(CREATE_MESSAGGI);
  await pool.query(CREATE_ADMIN);
  await runMigrations();
}

/**
 * Crea l'account Admin iniziale SOLO se:
 *  - la tabella admin è vuota
 *  - ADMIN_PASSWORD è impostata e lunga almeno 8 caratteri
 */
async function ensureInitialAdmin() {
  const [rows] = await pool.query("SELECT COUNT(*) AS n FROM admin");
  if (rows[0].n > 0) {
    return { created: false, reason: "admin-esistente" };
  }

  const username = (process.env.ADMIN_USERNAME || "admin").trim();
  const password = process.env.ADMIN_PASSWORD || "";

  if (password.length < 8) {
    return { created: false, reason: "password-non-impostata" };
  }

  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    "INSERT INTO admin (username, password_hash) VALUES (?, ?)",
    [username, hash]
  );
  return { created: true, username };
}

/**
 * Procedura completa (usata dalla CLI `npm run init-db`).
 * Non stampa nulla: il logging è responsabilità del chiamante/server.
 */
async function initDatabase() {
  await createDatabaseIfNeeded();
  await createTablesIfNeeded();
}

/* ------------------------------------------------------------------ */
/* Esecuzione da terminale                                             */
/* ------------------------------------------------------------------ */

async function runCli() {
  try {
    console.log("================================================");
    console.log(" 🏔️  SCI CLUB ADRANO — INIZIALIZZAZIONE DATABASE");
    console.log("================================================");

    console.log("[..] Connessione a MariaDB (senza database)...");
    const bootstrap = await createBootstrapConnection();
    console.log("[OK] MariaDB rilevato");

    console.log(`[..] Verifica database "${DB_NAME}"...`);
    const info = await verifyOrCreateDatabase(bootstrap);
    await bootstrap.end();
    console.log(
      info.created
        ? `[OK] Database "${DB_NAME}" creato`
        : `[OK] Database "${DB_NAME}" già presente`
    );

    console.log("[..] Verifica tabelle...");
    await createTablesIfNeeded();
    console.log("[OK] Tabelle verificate/create");

    const admin = await ensureInitialAdmin();
    if (admin.created) {
      console.log(`[OK] Account Admin creato: ${admin.username}`);
    } else if (admin.reason === "password-non-impostata") {
      console.log(
        "[i]  Nessun Admin creato: imposta ADMIN_PASSWORD nel .env (min 8 caratteri) oppure usa 'npm run create-admin'."
      );
    } else {
      console.log("[i]  Account Admin già presente: nessuna modifica.");
    }

    console.log("================================================");
  } catch (error) {
    console.error("[ERRORE] Inizializzazione fallita:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  initDatabase,
  ensureInitialAdmin,
  databaseExists,
  verifyOrCreateDatabase,
  createDatabaseIfNeeded,
  createTablesIfNeeded,
  runMigrations,
};
