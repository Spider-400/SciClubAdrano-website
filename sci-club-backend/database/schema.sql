-- ============================================================================
--  A.S.D. SCI CLUB ADRANO — Schema database
--  Database: sci_club_adrano  (MariaDB / MySQL)
--
--  Questo file permette di ricreare manualmente lo schema da HeidiSQL.
--  È NON distruttivo: usa CREATE ... IF NOT EXISTS e non esegue DROP.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `sci_club_adrano`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `sci_club_adrano`;

-- ----------------------------------------------------------------------------
-- Tabella: tesseramenti
-- Richieste di tesseramento FISI inviate dal modulo pubblico.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `tesseramenti` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(80) NOT NULL,
  `cognome` VARCHAR(80) NOT NULL,
  `sesso` ENUM('M','F') NOT NULL,
  `data_nascita` DATE NOT NULL,
  `nazionalita` VARCHAR(60) NOT NULL,
  `luogo_nascita` VARCHAR(120) NOT NULL,
  `codice_fiscale` CHAR(16) NOT NULL,
  `indirizzo` VARCHAR(160) NOT NULL,
  `citta` VARCHAR(100) NOT NULL,
  `cap` CHAR(5) NOT NULL,
  `email` VARCHAR(160) NOT NULL,
  `telefono` VARCHAR(30) NOT NULL,
  `precedente_tessera_fisi` ENUM('SI','NO') NOT NULL,
  `tipo_tessera` VARCHAR(120) NOT NULL,
  `pagamento` VARCHAR(190) NOT NULL,
  `privacy_accettata` TINYINT(1) NOT NULL DEFAULT 0,
  `stato` ENUM('nuovo','in_elaborazione','completato','annullato') NOT NULL DEFAULT 'nuovo',
  `email_inviata` TINYINT(1) NOT NULL DEFAULT 0,
  `note_admin` TEXT NULL,
  `data_creazione` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `data_aggiornamento` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stato` (`stato`),
  KEY `idx_data_creazione` (`data_creazione`),
  KEY `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabella: messaggi
-- Messaggi ricevuti dal modulo contatti del sito.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `messaggi` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(80) NOT NULL,
  `email` VARCHAR(160) NOT NULL,
  `messaggio` TEXT NOT NULL,
  `stato` ENUM('nuovo','letto','archiviato') NOT NULL DEFAULT 'nuovo',
  `data_creazione` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stato` (`stato`),
  KEY `idx_data_creazione` (`data_creazione`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- Tabella: admin
-- Account per il pannello di amministrazione.
-- La password è SEMPRE salvata come hash bcrypt, mai in chiaro.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admin` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(60) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `data_creazione` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ultimo_accesso` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- NOTA: nessun account admin viene inserito qui per evitare password
-- hardcoded. Per creare l'admin usa:
--   npm run create-admin
-- oppure imposta ADMIN_USERNAME / ADMIN_PASSWORD nel .env e avvia il server.
-- ----------------------------------------------------------------------------
