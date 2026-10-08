/* ============================================================================
   SCI CLUB ADRANO — Gestione consenso cookie / tecnologie
   ----------------------------------------------------------------------------
   Soluzione locale, senza dipendenze esterne.

   ESITO DELL'AUDIT (vedi cookie-policy.html):
   Il sito pubblico NON usa cookie di analisi, marketing, profilazione, pixel,
   embed di terze parti, mappe o iframe. L'unica risorsa esterna (Google Fonts)
   è stata rimossa e i font sono ora ospitati localmente. Non esistono quindi
   categorie opzionali da attivare: l'unica categoria è "Necessari".

   Questo script:
   - mostra un avviso informativo alla prima visita;
   - memorizza la scelta dell'utente in localStorage (chiave sotto);
   - permette di riaprire, modificare e revocare la scelta in ogni momento;
   - espone un'API pronta per bloccare in modo PREVENTIVO eventuali strumenti
     opzionali che venissero aggiunti in futuro (register / loadScript).
   ============================================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "sciclub_cookie_consent_v1";
  var CONSENT_VERSION = 1;

  /* --- Categorie realmente presenti nel sito ------------------------------
     "necessary": sempre attiva, non disattivabile. Comprende la memoria della
     scelta di consenso e le tecnologie tecniche indispensabili.
     Non esistono, ad oggi, cookie di preferenza/statistica/marketing. */
  var CATEGORIES = {
    necessary: {
      label: "Necessari / tecnici",
      description:
        "Indispensabili al funzionamento e alla sicurezza del sito e alla memorizzazione di questa scelta. Non richiedono consenso e non possono essere disattivati.",
      required: true,
    },
  };

  var OPTIONAL_CATEGORIES = Object.keys(CATEGORIES).filter(function (key) {
    return !CATEGORIES[key].required;
  });

  /* --- Stato ------------------------------------------------------------- */
  var state = null; // { version, decision, categories, timestamp }

  function safeParse(raw) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  function readState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = safeParse(raw);
      if (!parsed || parsed.version !== CONSENT_VERSION) return null;
      return parsed;
    } catch (error) {
      return null; // localStorage non disponibile: nessun tracciamento, si riparte da zero
    }
  }

  function writeState(next) {
    state = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      /* localStorage non disponibile: il consenso vale per la sessione corrente */
    }
    document.dispatchEvent(
      new CustomEvent("sciclub:consent", { detail: state })
    );
  }

  function clearState() {
    state = null;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* noop */
    }
    document.dispatchEvent(
      new CustomEvent("sciclub:consent", { detail: null })
    );
  }

  function isGranted(category) {
    if (!state) return false;
    if (CATEGORIES[category] && CATEGORIES[category].required) return true;
    return Boolean(state.categories && state.categories[category]);
  }

  /* --- Registro per strumenti opzionali (blocco preventivo) ---------------
     Uso futuro, quando/ se verranno aggiunti strumenti non necessari:

       SciClubConsent.register("analytics", function () {
         SciClubConsent.loadScript("https://esempio/analytics.js", {
           async: true,
         });
       });

     La callback viene eseguita SOLO se la categoria è stata accettata, e
     immediatamente se il consenso era già stato dato in precedenza. In caso
     di rifiuto non viene mai eseguita: nessuna chiamata di rete parte prima
     del consenso. */
  var registry = [];

  function register(category, callback) {
    if (typeof callback !== "function") return;
    registry.push({ category: category, callback: callback });
    if (isGranted(category)) {
      runCallback(category, callback);
    }
  }

  function runCallback(category, callback) {
    try {
      callback();
    } catch (error) {
      console.warn("[COOKIE] Impossibile inizializzare la categoria:", category, error);
    }
  }

  function runRegistry() {
    registry.forEach(function (entry) {
      if (isGranted(entry.category)) {
        // Eseguito una sola volta per entry
        if (!entry.done) {
          entry.done = true;
          runCallback(entry.category, entry.callback);
        }
      }
    });
  }

  function loadScript(src, attrs) {
    var script = document.createElement("script");
    script.src = src;
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        script.setAttribute(key, attrs[key]);
      });
    }
    document.head.appendChild(script);
    return script;
  }

  /* --- Costruzione interfaccia ------------------------------------------- */
  function buildBanner() {
    var banner = document.createElement("div");
    banner.className = "cookie-banner";
    banner.id = "cookieBanner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Informativa cookie");
    banner.innerHTML =
      '<div class="cookie-banner__inner">' +
      '<div class="cookie-banner__text">' +
      '<p class="cookie-banner__kicker">COOKIE · PRIVACY</p>' +
      '<h2 id="cookieBannerTitle">Questo sito usa solo tecnologie necessarie.</h2>' +
      '<p id="cookieBannerText">Non utilizziamo cookie di analisi, marketing o profilazione e non carichiamo servizi esterni di tracciamento. ' +
      'L\'unica memorizzazione sul tuo dispositivo è la registrazione di questa scelta. ' +
      'Per dettagli leggi la <a href="cookie-policy.html">Cookie Policy</a>.</p>' +
      "</div>" +
      '<div class="cookie-banner__actions">' +
      '<button type="button" class="cookie-btn cookie-btn--accept" data-cookie-action="accept">Accetta</button>' +
      '<button type="button" class="cookie-btn cookie-btn--reject" data-cookie-action="reject">Rifiuta</button>' +
      '<button type="button" class="cookie-btn cookie-btn--ghost" data-cookie-action="prefs">Personalizza</button>' +
      "</div>" +
      "</div>";
    return banner;
  }

  function buildModal() {
    var modal = document.createElement("div");
    modal.className = "cookie-modal";
    modal.id = "cookieModal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "cookieModalTitle");
    modal.hidden = true;

    var catsHtml = Object.keys(CATEGORIES)
      .map(function (key) {
        var cat = CATEGORIES[key];
        var disabled = cat.required ? " checked disabled" : "";
        var stateLabel = cat.required ? "Sempre attivi" : "Disattivato";
        return (
          '<li class="cookie-cat">' +
          "<div>" +
          "<strong>" +
          cat.label +
          "</strong>" +
          "<p>" +
          cat.description +
          "</p>" +
          "</div>" +
          '<label class="cookie-cat__state">' +
          '<input type="checkbox" name="category" value="' +
          key +
          '"' +
          disabled +
          " />" +
          stateLabel +
          "</label>" +
          "</li>"
        );
      })
      .join("");

    var noteHtml =
      OPTIONAL_CATEGORIES.length === 0
        ? '<p class="cookie-status" data-cookie-current>Nessuna categoria opzionale presente.</p>'
        : "";

    modal.innerHTML =
      '<div class="cookie-modal__backdrop" data-cookie-action="close"></div>' +
      '<div class="cookie-modal__panel" role="document">' +
      '<button type="button" class="cookie-modal__close" data-cookie-action="close" aria-label="Chiudi">&times;</button>' +
      '<p class="cookie-banner__kicker">PREFERENZE</p>' +
      '<h2 id="cookieModalTitle">Impostazioni cookie</h2>' +
      "<p>Puoi modificare o revocare la tua scelta in qualsiasi momento. " +
      "Questo sito non utilizza cookie di profilazione, analisi o marketing: l'unica categoria presente è quella tecnica. " +
      'Dettagli nella <a href="cookie-policy.html">Cookie Policy</a>.</p>' +
      '<ul class="cookie-cats">' +
      catsHtml +
      "</ul>" +
      noteHtml +
      '<div class="cookie-modal__actions">' +
      '<button type="button" class="cookie-btn cookie-btn--accept" data-cookie-action="accept">Accetta</button>' +
      '<button type="button" class="cookie-btn cookie-btn--reject" data-cookie-action="reject">Rifiuta</button>' +
      '<button type="button" class="cookie-btn cookie-btn--save" data-cookie-action="save">Salva preferenze</button>' +
      "</div>" +
      '<button type="button" class="cookie-revoke" data-cookie-action="revoke">Revoca ed elimina la scelta salvata</button>' +
      "</div>";

    return modal;
  }

  /* --- Gestione visualizzazione ------------------------------------------ */
  var banner = null;
  var modal = null;
  var lastFocused = null;

  function reserveSpace() {
    if (!banner || banner.hidden) {
      document.body.style.paddingBottom = "";
      return;
    }
    document.body.style.paddingBottom = banner.offsetHeight + "px";
  }

  function showBanner() {
    if (!banner) return;
    banner.hidden = false;
    document.body.classList.add("cookie-banner-open");
    reserveSpace();
  }

  function hideBanner() {
    if (!banner) return;
    banner.hidden = true;
    document.body.classList.remove("cookie-banner-open");
    reserveSpace();
  }

  function openModal() {
    if (!modal) return;
    lastFocused = document.activeElement;
    syncModalToState();
    modal.hidden = false;
    document.body.classList.add("cookie-modal-open");
    var focusTarget = modal.querySelector(
      ".cookie-modal__panel button, .cookie-modal__panel input, .cookie-modal__panel a"
    );
    if (focusTarget) focusTarget.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("cookie-modal-open");
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  function syncModalToState() {
    if (!modal) return;
    modal.querySelectorAll('input[name="category"]').forEach(function (input) {
      if (CATEGORIES[input.value] && CATEGORIES[input.value].required) {
        input.checked = true;
        return;
      }
      input.checked = isGranted(input.value);
    });
    var current = modal.querySelector("[data-cookie-current]");
    if (current) {
      var label =
        state && state.decision === "accept"
          ? "Ultima scelta: Accettato"
          : state && state.decision === "reject"
          ? "Ultima scelta: Rifiutato"
          : state && state.decision === "custom"
          ? "Ultima scelta: Personalizzato"
          : "Nessuna scelta registrata";
      current.textContent =
        label +
        (OPTIONAL_CATEGORIES.length === 0
          ? " · nessuna categoria opzionale presente"
          : "");
    }
  }

  function trapFocus(event) {
    if (event.key !== "Tab" || !modal || modal.hidden) return;
    var focusables = modal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusables.length === 0) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* --- Persistenza delle decisioni --------------------------------------- */
  function collectOptionalSelection() {
    var selected = {};
    OPTIONAL_CATEGORIES.forEach(function (key) {
      selected[key] = false;
    });
    if (modal) {
      modal.querySelectorAll('input[name="category"]').forEach(function (input) {
        if (OPTIONAL_CATEGORIES.indexOf(input.value) !== -1) {
          selected[input.value] = input.checked;
        }
      });
    }
    return selected;
  }

  function persist(decision, categories) {
    writeState({
      version: CONSENT_VERSION,
      decision: decision,
      categories: categories || {},
      timestamp: new Date().toISOString(),
    });
    runRegistry();
  }

  function handleAction(action) {
    if (action === "prefs") {
      openModal();
      return;
    }
    if (action === "close") {
      closeModal();
      return;
    }
    if (action === "accept") {
      persist("accept", allOptional(true));
      hideBanner();
      closeModal();
      return;
    }
    if (action === "reject") {
      persist("reject", allOptional(false));
      hideBanner();
      closeModal();
      return;
    }
    if (action === "save") {
      var selection = collectOptionalSelection();
      persist("custom", selection);
      hideBanner();
      closeModal();
      return;
    }
    if (action === "revoke") {
      clearState();
      syncModalToState();
      runRegistry();
      return;
    }
  }

  function allOptional(value) {
    var out = {};
    OPTIONAL_CATEGORIES.forEach(function (key) {
      out[key] = value;
    });
    return out;
  }

  /* --- Avvio ------------------------------------------------------------- */
  function init() {
    banner = buildBanner();
    modal = buildModal();
    document.body.appendChild(banner);
    document.body.appendChild(modal);

    state = readState();

    document.addEventListener("click", function (event) {
      var trigger = event.target.closest
        ? event.target.closest("[data-cookie-action]")
        : null;
      if (trigger) {
        event.preventDefault();
        handleAction(trigger.getAttribute("data-cookie-action"));
        return;
      }
      var settings = event.target.closest
        ? event.target.closest("[data-cookie-settings]")
        : null;
      if (settings) {
        event.preventDefault();
        openModal();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        if (modal && !modal.hidden) closeModal();
      }
      trapFocus(event);
    });

    window.addEventListener("resize", reserveSpace);

    runRegistry();

    if (!state) {
      showBanner();
    } else {
      hideBanner();
    }
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    categories: CATEGORIES,
    isGranted: isGranted,
    register: register,
    loadScript: loadScript,
    open: function () {
      openModal();
    },
    revoke: function () {
      clearState();
      runRegistry();
    },
    getState: function () {
      return state;
    },
  };

  window.SciClubConsent = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
