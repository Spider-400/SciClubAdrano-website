# 🏔️ A.S.D. Sci Club Adrano — Backend

Backend **Node.js + Express + MariaDB** per il sito ufficiale dello **Sci Club Adrano**.
Gestisce:

- 📝 ricezione delle **richieste di tesseramento FISI**
- ✉️ ricezione dei **messaggi di contatto**
- 🔐 **pannello Admin** protetto (dashboard, tesseramenti, messaggi)
- 📧 **invio email** tramite Nodemailer
- 🗄️ database **MariaDB** creato/verificato automaticamente all'avvio

> Il **frontend statico** (Cloudflare) resta separato. Il backend è indipendente.

---

## 1. Requisiti

| Software | Versione consigliata |
| --- | --- |
| Node.js | 18 o superiore (testato con Node 20/24) |
| npm | incluso con Node |
| MariaDB | 10.5+ (o MySQL 8 compatibile) |
| HeidiSQL | ultima versione (opzionale, per gestire il DB) |

---

## 2. Installazione di Node.js

1. Vai su <https://nodejs.org> e scarica la versione **LTS**.
2. Installa con le opzioni predefinite.
3. Verifica da terminale:

```powershell
node -v
npm -v
```

---

## 3. Installazione di MariaDB

1. Scarica MariaDB da <https://mariadb.org/download/>.
2. Durante l'installazione imposta una **password per l'utente `root`** (o crea un utente dedicato).
3. Avvia il servizio. Su Windows può essere gestito da *Servizi* → `MariaDB`.
4. Verifica la connessione:

```powershell
mysql -u root -p
```

In alternativa puoi usare **XAMPP** (che include MariaDB/MySQL).

---

## 4. Configurazione di HeidiSQL

1. Apri **HeidiSQL** → *Nuova sessione*.
2. Compila:
   - **Host/IP:** `127.0.0.1`
   - **Utente:** `root` (o l'utente creato)
   - **Password:** la password impostata in fase di installazione
   - **Porta:** `3306`
3. Clicca **Apri**. Il database `sci_club_adrano` comparirà automaticamente
   dopo il primo avvio del backend (o dopo `npm run init-db`).

Struttura attesa:

```
sci_club_adrano
├── admin
├── messaggi
└── tesseramenti
```

---

## 5. Creazione del database

Il database **non va creato manualmente**: il backend lo crea e verifica
automaticamente all'avvio (senza mai cancellare dati esistenti).

Se preferisci crearlo da HeidiSQL, esegui il contenuto di
[`database/schema.sql`](database/schema.sql) nell'editor query.

---

## 6. Configurazione `.env`

1. Copia il file di esempio:

```powershell
Copy-Item .env.example .env
```

2. Apri `.env` e compila i valori. Riferimento:

```ini
PORT=3000
NODE_ENV=development
FRONTEND_URL=https://tuo-sito.pages.dev   # URL frontend Cloudflare (anche più di uno, separati da virgola)

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=la_tua_password
DB_NAME=sci_club_adrano

SESSION_SECRET=                        # genera un valore lungo e casuale
ADMIN_USERNAME=admin
ADMIN_PASSWORD=                        # usata solo per il primo admin (min 8 caratteri)

SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM="Sci Club Adrano <no-reply@example.com>"
EMAIL_TO=autketchup@gmail.com          # email di TEST
```

Genera un `SESSION_SECRET` sicuro con:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> ⚠️ Il file `.env` **non deve mai essere committato**. È già in `.gitignore`.

---

## 7. Installazione delle dipendenze

Dentro la cartella `sci-club-backend`:

```powershell
npm install
```

---

## 8. Avvio del server

```powershell
npm start
```

In sviluppo, con riavvio automatico ad ogni modifica:

```powershell
npm run dev
```

Output atteso:

```
========================================================
        🏔️  SCI CLUB ADRANO — BACKEND
========================================================
[..] Connessione al database...
[OK] MariaDB rilevato
[..] Verifica tabelle...
[OK] Database sci_club_adrano connesso
[OK] Tabelle verificate/create
--------------------------------------------------------
Server:       http://localhost:3000
Admin:        http://localhost:3000/admin
Health:       GET  /api/health
FISI:         POST /api/fisi
Tesseramenti: GET  /api/tesseramenti
Messaggi:     GET  /api/messages
--------------------------------------------------------
📧 Email attiva — destinatario:
   autketchup@gmail.com
========================================================
```

---

## 9. Accesso al pannello Admin

1. Apri <http://localhost:3000/admin>.
2. Accedi con:
   - **Username:** il valore di `ADMIN_USERNAME` (default `admin`)
   - **Password:** il valore di `ADMIN_PASSWORD`

**Primo account Admin** — due modi:

- Imposta `ADMIN_PASSWORD` nel `.env` (min 8 caratteri) e avvia il server:
  l'account viene creato solo se la tabella `admin` è vuota.
- Oppure usa lo script dedicato:

```powershell
npm run create-admin -- admin LaTuaPasswordSicura
```

La password è sempre salvata come **hash bcrypt**, mai in chiaro.

---

## 10. Test delle API

### Health check

```powershell
curl http://localhost:3000/api/health
```

Risposta:

```json
{ "success": true, "server": "online", "database": "connected" }
```

### Invio tesseramento FISI (pubblico)

```powershell
curl -X POST http://localhost:3000/api/fisi `
  -H "Content-Type: application/json" `
  -d '{\"nome\":\"Mario\",\"cognome\":\"Rossi\",\"sesso\":\"M\",\"dataNascita\":\"1990-05-10\",\"nazionalita\":\"Italiana\",\"luogoNascita\":\"Adrano\",\"codiceFiscale\":\"RSSMRA90E10A056X\",\"indirizzo\":\"Via Etna 1\",\"citta\":\"Adrano\",\"cap\":\"95031\",\"email\":\"mario.rossi@example.com\",\"telefono\":\"3331234567\",\"precedente\":\"NO\",\"tipoTessera\":\"Civile Adulto — € 40\",\"pagamento\":\"Bonifico bancario (modalità da confermare con la segreteria)\",\"privacy\":true}'
```

### Messaggi di contatto (pubblico)

```powershell
curl -X POST http://localhost:3000/api/contact `
  -H "Content-Type: application/json" `
  -d '{\"nome\":\"Anna\",\"email\":\"anna@example.com\",\"messaggio\":\"Vorrei informazioni sul tesseramento.\"}'
```

Le rotte `GET /api/tesseramenti`, `GET /api/messages`, `GET /api/stats` e
`PATCH/DELETE` richiedono la sessione Admin.

---

## 11. Configurazione email

Il backend usa **Nodemailer**. Finché `SMTP_HOST` è vuoto il servizio email è
**disattivato**: i dati vengono comunque salvati nel database (la colonna
`email_inviata` resterà `0` e il pannello Admin lo segnala).

Esempio con **Gmail + App Password**:

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=tuo.indirizzo@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx   # App Password, NON la password normale
EMAIL_FROM="Sci Club Adrano <tuo.indirizzo@gmail.com>"
```

> Per Gmail attiva la **verifica in due passaggi** e genera una *App Password*:
> <https://myaccount.google.com/apppasswords>.

---

## 12. Collegamento del frontend

Il modulo `tesseramento-fisi.js` invia i dati a `POST /api/fisi` tramite `fetch`.
L'URL del backend (`API_BASE`) viene determinato automaticamente in base
all'hostname della pagina:

- **Produzione** (frontend su `https://website.sciclubadrano.workers.dev`):
  usa sempre `https://sci-club-adrano-backend.onrender.com`.
- **Sviluppo locale** (hostname `localhost` / `127.0.0.1`): usa
  `http://localhost:3000`.

Override manuale opzionale (da inserire nell'HTML prima dello script, ad es.
per puntare a un backend di test):

```html
<script>window.SCICLUB_API_BASE = "https://sci-club-adrano-backend.onrender.com";</script>
```

Ricorda di aggiungere l'origine del frontend in `FRONTEND_URL` / `FRONTEND_PUBLIC_URL`
(`.env`) perché il CORS la autorizzi.

---

## 13. Problemi comuni

| Problema | Soluzione |
| --- | --- |
| `Impossibile connettersi a MariaDB` | Il servizio MariaDB non è avviato, oppure `DB_*` nel `.env` sono errati. |
| `La porta 3000 è già in uso` | Un altro processo la occupa: cambia `PORT` nel `.env` o chiudi il processo. |
| Login non funziona | Manca l'account Admin: esegui `npm run create-admin -- admin Password123`. |
| Email non inviate | `SMTP_HOST`/credenziali non configurate. I dati sono salvati comunque. |
| Errore CORS nel browser | L'origine del frontend non è in `FRONTEND_URL`. |
| Errore `Access denied for user` | Utente/password database errati nel `.env`. |
| Errore `auth_gssapi_client` / `ER_NOT_SUPPORTED_AUTH_MODE` | L'utente MariaDB usa un plugin di autenticazione non supportato da Node. Crea un utente dedicato (vedi sotto). |

### Creare un utente database dedicato (consigliato)

Da HeidiSQL (o dalla console `mysql`) esegui, sostituendo la password:

```sql
CREATE USER 'sciclub'@'localhost' IDENTIFIED BY 'UnaPasswordSicura';
GRANT ALL PRIVILEGES ON sci_club_adrano.* TO 'sciclub'@'localhost';
FLUSH PRIVILEGES;
```

Poi aggiorna il `.env`:

```ini
DB_USER=sciclub
DB_PASSWORD=UnaPasswordSicura
```

> Nota: se l'errore è `auth_gssapi_client`, l'utente `root` di quella
> installazione di MariaDB usa un plugin di autenticazione di Windows non
> supportato da `mysql2`. La soluzione è creare un utente con autenticazione
> standard come sopra.

---

## 14. Passare dall'email di TEST a quella di PRODUZIONE

Durante lo sviluppo `EMAIL_TO` punta all'indirizzo di test.
Per andare in produzione **basta modificare una riga** nel `.env`:

```ini
# Sviluppo
EMAIL_TO=autketchup@gmail.com

# Produzione
EMAIL_TO=sciclub.adrano@gmail.com
```

Nessun altro file va toccato: l'indirizzo è letto solo da `EMAIL_TO`.

---

## Struttura del progetto

```
sci-club-backend/
├── server.js                 # avvio: banner, middleware, rotte
├── package.json
├── .env / .env.example / .gitignore
├── README.md
├── config/
│   └── database.js           # pool mysql2 + connessione bootstrap
├── database/
│   ├── init.js               # creazione DB/tabelle NON distruttiva
│   └── schema.sql            # schema completo per HeidiSQL
├── routes/
│   ├── health.js             # GET  /api/health
│   ├── auth.js               # /api/auth/login|logout|me
│   ├── fisi.js               # POST /api/fisi
│   ├── tesseramenti.js       # GET/PATCH/DELETE /api/tesseramenti
│   ├── messages.js           # /api/contact + /api/messages
│   └── stats.js              # GET  /api/stats
├── middleware/
│   ├── auth.js               # requireAuth
│   └── security.js           # helmet, cors, rate limit
├── services/
│   └── email.js              # Nodemailer + template email
├── utils/
│   └── validation.js         # validazione input
├── scripts/
│   └── create-admin.js       # creazione/reset account Admin
└── admin/
    ├── index.html            # pannello Admin
    ├── admin.css
    └── admin.js
```

---

## Sicurezza

- password Admin con hash **bcrypt**
- **prepared statements** (mysql2) contro SQL injection
- **helmet**, **CORS** configurabile, **rate limiting**
- sessioni **HttpOnly** + `SameSite` (Secure su HTTPS)
- validazione sia frontend sia backend
- escaping HTML nel pannello Admin contro XSS
- limite dimensione richieste (`100kb`)
- nessun dato personale stampato nei log

---

## Licenza

Uso interno — A.S.D. Sci Club Adrano.
