(function () {
  const form = document.getElementById("contactForm");
  if (!form) return;

  const status = document.getElementById("contactStatus");
  const submitButton = form.querySelector('button[type="submit"]');

  /**
   * URL del backend (stesso schema di tesseramento-fisi.js).
   * - Produzione (frontend su Cloudflare Workers): backend Render.
   * - Sviluppo locale (localhost / 127.0.0.1 / file://): backend locale.
   * Nessun fallback a localhost quando il frontend è online.
   */
  const PROD_API_BASE = "https://sci-club-adrano-backend.onrender.com";
  const DEV_API_BASE = "http://localhost:3000";
  const currentHost =
    typeof window !== "undefined" && window.location ? window.location.hostname : "";
  const currentProtocol =
    typeof window !== "undefined" && window.location ? window.location.protocol : "";
  const isLocalDev =
    currentProtocol === "file:" ||
    currentHost === "" ||
    currentHost === "localhost" ||
    currentHost === "127.0.0.1" ||
    currentHost === "::1";
  const API_BASE = (isLocalDev ? DEV_API_BASE : PROD_API_BASE).replace(/\/+$/, "");

  const value = (data, key) => (data.get(key) || "").toString().trim();

  function setStatus(message, type) {
    if (!status) return;
    status.textContent = message;
    status.classList.remove("is-ok", "is-error");
    if (type) status.classList.add(type);
  }

  if (submitButton) {
    submitButton.dataset.originalText = submitButton.innerHTML;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // nessun invio nativo, nessun mailto

    const data = new FormData(form);
    const payload = {
      nome: value(data, "nome"),
      email: value(data, "email"),
      messaggio: value(data, "messaggio"),
    };

    // Validazione esplicita (oltre a quella HTML del browser).
    if (payload.nome.length < 2) {
      setStatus("Inserisci un nome valido (minimo 2 caratteri).", "is-error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email)) {
      setStatus("Inserisci un indirizzo email valido.", "is-error");
      return;
    }
    if (payload.messaggio.length < 10) {
      setStatus("Il messaggio deve contenere almeno 10 caratteri.", "is-error");
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Invio in corso...";
    }
    setStatus("Invio in corso...", null);

    try {
      const response = await fetch(API_BASE + "/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let result = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (!response.ok || !result || !result.success) {
        const fieldMessage =
          result && result.fields ? Object.values(result.fields)[0] : null;
        console.warn("[CONTATTI] Invio rifiutato:", fieldMessage || (result && result.error));
        setStatus("Impossibile inviare il messaggio. Riprova.", "is-error");
        return; // il form NON viene svuotato in caso di errore
      }

      setStatus("Messaggio inviato correttamente. Ti risponderemo al più presto.", "is-ok");
      form.reset(); // reset SOLO dopo un invio riuscito
    } catch (error) {
      console.error("[CONTATTI] Errore di rete:", error);
      setStatus("Impossibile inviare il messaggio. Riprova.", "is-error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        if (submitButton.dataset.originalText) {
          submitButton.innerHTML = submitButton.dataset.originalText;
        }
      }
    }
  });
})();
