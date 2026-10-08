(function () {
  "use strict";

  /* ------------------------------------------------------------------ */
  /* Utility                                                            */
  /* ------------------------------------------------------------------ */

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const STATO_LABEL = {
    nuovo: "Nuovo",
    in_elaborazione: "In elaborazione",
    completato: "Completato",
    annullato: "Annullato",
    letto: "Letto",
    archiviato: "Archiviato",
  };

  const MSG_LABEL = {
    nuovo: "Non letto",
    letto: "Letto",
    archiviato: "Archiviato",
  };

  function formatDate(value) {
    if (!value) return "—";
    const iso = String(value).replace(" ", "T");
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return escapeHtml(value);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function stateBadge(stato) {
    return `<span class="badge badge-${escapeHtml(stato)}">${escapeHtml(STATO_LABEL[stato] || stato)}</span>`;
  }

  function msgBadge(stato) {
    return `<span class="badge badge-msg-${escapeHtml(stato)}">${escapeHtml(MSG_LABEL[stato] || stato)}</span>`;
  }

  let toastTimer = null;
  function showToast(message, type) {
    const el = $("toast");
    el.textContent = message;
    el.className = "toast is-visible" + (type ? " is-" + type : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.className = "toast";
    }, 3200);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const error = new Error((payload && payload.error) || "Errore di rete.");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  /* ------------------------------------------------------------------ */
  /* Autenticazione                                                     */
  /* ------------------------------------------------------------------ */

  const loginView = $("loginView");
  const appView = $("appView");

  function showLogin() {
    loginView.classList.remove("is-hidden");
    appView.classList.add("is-hidden");
    stopAutoRefresh();
  }

  function showApp(username) {
    loginView.classList.add("is-hidden");
    appView.classList.remove("is-hidden");
    $("userLabel").textContent = username || "admin";
    const initials = (username || "S A").replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "SA";
    document.querySelector(".avatar").textContent = initials;
    refreshAll();
    startAutoRefresh();
  }

  async function checkSession() {
    try {
      const data = await api("/api/auth/me");
      if (data && data.authenticated) {
        showApp(data.user && data.user.username);
        return;
      }
    } catch {
      /* non autenticato */
    }
    showLogin();
  }

  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("loginButton");
    const errorEl = $("loginError");
    errorEl.textContent = "";
    button.disabled = true;
    button.textContent = "Accesso...";

    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: $("loginUsername").value,
          password: $("loginPassword").value,
        }),
      });
      $("loginForm").reset();
      showApp(data.user && data.user.username);
    } catch (error) {
      errorEl.textContent = error.message || "Accesso non riuscito.";
    } finally {
      button.disabled = false;
      button.textContent = "Accedi";
    }
  });

  $("logoutButton").addEventListener("click", async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignora */
    }
    showLogin();
  });

  /* ------------------------------------------------------------------ */
  /* Navigazione                                                        */
  /* ------------------------------------------------------------------ */

  let currentView = "dashboard";
  const VIEW_TITLES = {
    dashboard: "Dashboard",
    tesseramenti: "Tesseramenti",
    messaggi: "Messaggi",
  };

  function switchView(view) {
    currentView = view;
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === view);
    });
    ["dashboard", "tesseramenti", "messaggi"].forEach((name) => {
      $("view-" + name).classList.toggle("is-hidden", name !== view);
    });
    $("viewTitle").textContent = VIEW_TITLES[view];
    $("sidebar").classList.remove("is-open");
  }

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  $("menuButton").addEventListener("click", () => $("sidebar").classList.toggle("is-open"));

  $("refreshButton").addEventListener("click", async () => {
    // Aggiornamento manuale: stesso refresh del polling, eseguito subito.
    const ok = await refreshAll({ silent: false });
    showToast(ok ? "Dati aggiornati." : "Aggiornamento non riuscito.", ok ? "ok" : "err");
  });

  /* ------------------------------------------------------------------ */
  /* Refresh completo + polling (senza intervalli duplicati)            */
  /* ------------------------------------------------------------------ */

  // Unico punto di refresh: dashboard (badge/totali) + tesseramenti + messaggi.
  // `silent: true` = modalità polling: non mostra errori invasivi e non
  // sovrascrive i dati già presenti in caso di errore.
  async function refreshAll(options = {}) {
    const results = await Promise.all([
      loadDashboard(options),
      loadTesseramenti(options),
      loadMessaggi(options),
    ]);
    return results.every(Boolean);
  }

  const POLL_INTERVAL_MS = 10000; // 10 secondi
  let autoRefreshTimer = null; // UN SOLO polling per sessione Admin

  function startAutoRefresh() {
    if (autoRefreshTimer) return; // non crea mai un secondo interval
    autoRefreshTimer = setInterval(() => {
      const appVisible = !appView.classList.contains("is-hidden");
      const modalClosed = $("modal").classList.contains("is-hidden");
      const pageVisible = document.visibilityState === "visible";
      // Niente richieste inutili: solo se il pannello è aperto e la pagina attiva.
      if (appVisible && modalClosed && pageVisible) {
        refreshAll({ silent: true });
      }
    }, POLL_INTERVAL_MS);
  }

  function stopAutoRefresh() {
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
      autoRefreshTimer = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Dashboard                                                          */
  /* ------------------------------------------------------------------ */

  async function loadDashboard() {
    try {
      const data = await api("/api/stats");
      const t = data.tesseramenti;
      document.querySelectorAll("[data-stat]").forEach((el) => {
        const key = el.dataset.stat;
        if (key === "messaggi") el.textContent = data.messaggi.totale; // TOTALE
        else el.textContent = t[key] !== undefined ? t[key] : "0";
      });
      $("ultimaRichiesta").textContent = t.ultima_richiesta
        ? formatDate(t.ultima_richiesta)
        : "—";
      $("ultimaRichiestaMeta").textContent = t.totale
        ? `${t.nuovi} nuove richieste da gestire · ${t.completati} completate.`
        : "Nessuna richiesta ricevuta finora.";

      setBadge("navTessBadge", t.nuovi);
      setBadge("navMsgBadge", data.messaggi.nuovi); // NON LETTI
      // Orario reale: aggiornato SOLO quando la richiesta è andata a buon fine.
      markUpdated();
      return true;
    } catch (error) {
      // In polling (silent) nessun errore invasivo: si ritenta al giro successivo.
      // Su 401 non si fa logout automatico.
      return false;
    }
  }

  function setBadge(id, value) {
    const el = $(id);
    el.textContent = value > 0 ? String(value) : "";
  }

  function markUpdated() {
    $("updatedLabel").textContent = "Aggiornato " + new Date().toLocaleTimeString("it-IT");
  }

  /* ------------------------------------------------------------------ */
  /* Tesseramenti                                                       */
  /* ------------------------------------------------------------------ */

  let searchTimer = null;
  let tessHasData = false;

  async function loadTesseramenti({ silent = false } = {}) {
    const params = new URLSearchParams();
    const search = $("searchTess").value.trim();
    const stato = $("filterStato").value;
    if (search) params.set("search", search);
    if (stato) params.set("stato", stato);

    const body = $("tessBody");
    try {
      const data = await api("/api/tesseramenti?" + params.toString());
      if (!data.items.length) {
        tessHasData = true;
        body.innerHTML = '<tr><td colspan="9" class="empty">Nessun tesseramento trovato.</td></tr>';
        return true;
      }
      tessHasData = true;
      body.innerHTML = data.items
        .map((item) => {
          const emailCell = item.email_inviata
            ? '<span class="badge badge-sent">Inviata</span>'
            : '<span class="badge badge-fail">No</span>';
          return `<tr>
            <td class="mono">#${escapeHtml(item.id)}</td>
            <td>${escapeHtml(item.nome)}</td>
            <td>${escapeHtml(item.cognome)}</td>
            <td>${escapeHtml(item.tipo_tessera)}</td>
            <td>${escapeHtml(item.email)}</td>
            <td>${emailCell}</td>
            <td>${stateBadge(item.stato)}</td>
            <td class="mono">${formatDate(item.data_creazione)}</td>
            <td><button class="btn btn-outline btn-small" data-detail="${escapeHtml(item.id)}" type="button">Dettagli</button></td>
          </tr>`;
        })
        .join("");
      return true;
    } catch (error) {
      // Errore in polling: NON si cancella la tabella. Si mantengono i dati
      // già caricati e si ritenta al giro successivo. Errore visibile solo
      // se non abbiamo ancora nessun dato (primo caricamento).
      if (!silent && !tessHasData) {
        body.innerHTML = `<tr><td colspan="9" class="empty">${escapeHtml(error.message)}</td></tr>`;
      }
      return false;
    }
  }

  $("searchTess").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadTesseramenti(), 350);
  });
  $("filterStato").addEventListener("change", () => loadTesseramenti());

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-detail]");
    if (button) openDetail(button.dataset.detail);
  });

  /* ------------------------------------------------------------------ */
  /* Dettaglio tesseramento                                             */
  /* ------------------------------------------------------------------ */

  let currentDetail = null;

  function detailSection(title, rows) {
    const cells = rows
      .map(
        ([label, value]) =>
          `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value === null || value === undefined || value === "" ? "—" : value)}</td></tr>`
      )
      .join("");
    return `<div class="detail-section"><h3>${escapeHtml(title)}</h3><table class="detail-list">${cells}</table></div>`;
  }

  async function openDetail(id) {
    try {
      const data = await api("/api/tesseramenti/" + encodeURIComponent(id));
      currentDetail = data.item;
      const t = data.item;

      $("modalTitle").textContent = `Tesseramento #${t.id} — ${t.nome} ${t.cognome}`;
      $("modalBody").innerHTML = `
        <div class="detail-section">
          <h3>Stato attuale</h3>
          <p>${stateBadge(t.stato)} ${t.email_inviata ? '<span class="badge badge-sent">Email inviata</span>' : '<span class="badge badge-fail">Email non inviata</span>'}</p>
        </div>
        ${detailSection("Dati personali", [
          ["Nome", t.nome], ["Cognome", t.cognome], ["Sesso", t.sesso],
          ["Data di nascita", t.data_nascita], ["Nazionalità", t.nazionalita],
          ["Luogo di nascita", t.luogo_nascita], ["Codice fiscale", t.codice_fiscale],
        ])}
        ${detailSection("Residenza / domicilio", [
          ["Indirizzo", t.indirizzo], ["Città", t.citta], ["CAP", t.cap],
        ])}
        ${detailSection("Contatti", [
          ["Email", t.email], ["Telefono", t.telefono],
        ])}
        ${detailSection("Tesseramento", [
          // Codice interno ENUM 'SI'/'NO' -> etichetta utente "Sì"/"No" (solo visualizzazione).
          ["Precedente tessera FISI", t.precedente_tessera_fisi === "SI" ? "Sì" : t.precedente_tessera_fisi === "NO" ? "No" : t.precedente_tessera_fisi],
          ["Tipo di tessera", t.tipo_tessera],
          ["Privacy", t.privacy_accettata ? "Accettata" : "Non accettata"],
        ])}
        ${detailSection("Pagamento", [["Modalità", t.pagamento]])}
        ${detailSection("Registro", [
          ["Creata il", formatDate(t.data_creazione)],
          ["Aggiornata il", formatDate(t.data_aggiornamento)],
        ])}
        <div class="detail-section">
          <h3>Note admin</h3>
          <textarea id="detailNote" placeholder="Annotazioni interne (opzionale)">${escapeHtml(t.note_admin || "")}</textarea>
        </div>
        <div class="detail-actions">
          <select id="detailStato">
            ${["nuovo", "in_elaborazione", "completato", "annullato"]
              .map((s) => `<option value="${s}" ${s === t.stato ? "selected" : ""}>${escapeHtml(STATO_LABEL[s])}</option>`)
              .join("")}
          </select>
          <button class="btn btn-primary" type="button" id="detailSave">Salva modifiche</button>
          <button class="btn btn-danger" type="button" id="detailDelete">Elimina</button>
        </div>`;

      $("detailSave").addEventListener("click", saveDetail);
      $("detailDelete").addEventListener("click", deleteDetail);
      showModal();
    } catch (error) {
      showToast(error.message, "err");
    }
  }

  async function saveDetail() {
    if (!currentDetail) return;
    const stato = $("detailStato").value;
    const note = $("detailNote").value;
    const button = $("detailSave");
    button.disabled = true;
    button.textContent = "Salvataggio...";
    try {
      await api("/api/tesseramenti/" + encodeURIComponent(currentDetail.id), {
        method: "PATCH",
        body: JSON.stringify({ stato, note_admin: note }),
      });
      showToast("Tesseramento aggiornato.", "ok");
      closeModal();
      refreshAll();
    } catch (error) {
      showToast(error.message, "err");
    } finally {
      button.disabled = false;
      button.textContent = "Salva modifiche";
    }
  }

  async function deleteDetail() {
    if (!currentDetail) return;
    const conferma = window.confirm(
      `Eliminare definitivamente il tesseramento #${currentDetail.id} di ${currentDetail.nome} ${currentDetail.cognome}? L'operazione non può essere annullata.`
    );
    if (!conferma) return;
    try {
      await api("/api/tesseramenti/" + encodeURIComponent(currentDetail.id), {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      showToast("Tesseramento eliminato.", "ok");
      closeModal();
      refreshAll();
    } catch (error) {
      showToast(error.message, "err");
    }
  }

  /* ------------------------------------------------------------------ */
  /* Messaggi (inbox)                                                   */
  /* ------------------------------------------------------------------ */

  let msgHasData = false;

  async function loadMessaggi({ silent = false } = {}) {
    const body = $("msgBody");
    try {
      const data = await api("/api/messages");
      if (!data.items.length) {
        msgHasData = true;
        body.innerHTML = '<tr><td colspan="7" class="empty">Nessun messaggio ricevuto.</td></tr>';
        return true;
      }
      msgHasData = true;
      body.innerHTML = data.items
        .map((m) => {
          const unread = m.stato === "nuovo";
          return `<tr class="${unread ? "row-unread" : ""}">
            <td class="mono">#${escapeHtml(m.id)}${unread ? ' <span class="unread-dot" title="Non letto"></span>' : ""}</td>
            <td>${escapeHtml(m.nome)}</td>
            <td>${escapeHtml(m.email)}</td>
            <td><span class="cell-clip" title="${escapeHtml(m.messaggio)}">${escapeHtml(m.messaggio)}</span></td>
            <td class="mono">${formatDate(m.data_creazione)}</td>
            <td>${msgBadge(m.stato)}</td>
            <td><button class="btn btn-outline btn-small" data-messaggio="${escapeHtml(m.id)}" type="button">Apri</button></td>
          </tr>`;
        })
        .join("");
      return true;
    } catch (error) {
      // Errore in polling: mantiene i messaggi già presenti e ritenta dopo.
      if (!silent && !msgHasData) {
        body.innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(error.message)}</td></tr>`;
      }
      return false;
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-messaggio]");
    if (button) openMessaggio(button.dataset.messaggio);
  });

  async function openMessaggio(id) {
    try {
      const data = await api("/api/messages/" + encodeURIComponent(id));
      const m = data.item;
      if (!m) {
        showToast("Messaggio non trovato.", "err");
        return;
      }

      // Un messaggio aperto diventa LETTO (persistito nel database).
      if (m.stato === "nuovo") {
        try {
          await api("/api/messages/" + encodeURIComponent(m.id) + "/read", { method: "PATCH" });
          m.stato = "letto";
          loadMessaggi();
          loadDashboard(); // aggiorna il badge non letti
        } catch (error) {
          showToast(error.message, "err");
        }
      }

      const replyHref =
        "mailto:" +
        escapeHtml(m.email) +
        "?subject=" +
        encodeURIComponent("Re: il tuo messaggio allo Sci Club Adrano");

      $("modalTitle").textContent = `Messaggio #${m.id} — ${m.nome}`;
      $("modalBody").innerHTML = `
        ${detailSection("Mittente", [["Nome", m.nome], ["Email", m.email]])}
        ${detailSection("Data", [["Ricevuto il", formatDate(m.data_creazione)]])}
        <div class="detail-section">
          <h3>Messaggio</h3>
          <div class="mail-body">${escapeHtml(m.messaggio)}</div>
        </div>
        <div class="detail-actions">
          <select id="msgStato">
            ${["nuovo", "letto", "archiviato"]
              .map((s) => `<option value="${s}" ${s === m.stato ? "selected" : ""}>${escapeHtml(MSG_LABEL[s])}</option>`)
              .join("")}
          </select>
          <button class="btn btn-outline" type="button" id="msgSave">Aggiorna stato</button>
          <a class="btn btn-primary" id="msgReply" href="${replyHref}">✉ Rispondi via email</a>
        </div>`;

      $("msgSave").addEventListener("click", async () => {
        try {
          await api("/api/messages/" + encodeURIComponent(m.id), {
            method: "PATCH",
            body: JSON.stringify({ stato: $("msgStato").value }),
          });
          showToast("Messaggio aggiornato.", "ok");
          closeModal();
          loadMessaggi();
          loadDashboard();
        } catch (error) {
          showToast(error.message, "err");
        }
      });

      showModal();
    } catch (error) {
      showToast(error.message, "err");
    }
  }

  /* ------------------------------------------------------------------ */
  /* Modale                                                             */
  /* ------------------------------------------------------------------ */

  function showModal() {
    $("modal").classList.remove("is-hidden");
    document.body.style.overflow = "hidden";
  }
  function closeModal() {
    $("modal").classList.add("is-hidden");
    document.body.style.overflow = "";
    currentDetail = null;
  }

  $("modalClose").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (event) => {
    if (event.target === $("modal")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  /* ------------------------------------------------------------------ */
  /* Avvio                                                              */
  /* ------------------------------------------------------------------ */

  checkSession();
})();
