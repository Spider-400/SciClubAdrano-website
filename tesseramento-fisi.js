(function () {
  const form = document.getElementById("tesseramentoForm");
  if (!form) return;

  const status = document.getElementById("formStatus");
  const submitButton = form.querySelector('button[type="submit"]');

  /**
   * URL del backend Node.js.
   * - In sviluppo il backend gira su http://localhost:3000
   * - In produzione puoi impostare l'URL pubblico da qualsiasi punto prima
   *   di questo script, ad esempio:
   *       <script>window.SCICLUB_API_BASE = "https://api.sciclubadrano.it";</script>
   *   oppure modificare direttamente il valore di fallback qui sotto.
   */
  const API_BASE = (
    (typeof window !== "undefined" && window.SCICLUB_API_BASE) ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");

  const value = (data, key) => (data.get(key) || "").toString().trim();

  function setStatus(message, type) {
    if (!status) return;
    status.textContent = message;
    status.classList.remove("is-ok", "is-error");
    if (type) status.classList.add(type);
  }

  // Memorizza il contenuto originale del pulsante per ripristinarlo dopo.
  if (submitButton) {
    submitButton.dataset.originalText = submitButton.innerHTML;
  }

  console.log("[FISI] Script caricato: listener submit collegato.");

  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // impedisce l'invio nativo del form (nessun mailto, nessun reload)

    if (!form.checkValidity()) {
      form.reportValidity();
      console.log("[FISI] Validazione HTML non superata: invio annullato.");
      return;
    }

    const data = new FormData(form);

    const payload = {
      nome: value(data, "nome"),
      cognome: value(data, "cognome"),
      sesso: value(data, "sesso"),
      dataNascita: value(data, "dataNascita"),
      nazionalita: value(data, "nazionalita"),
      luogoNascita: value(data, "luogoNascita"),
      codiceFiscale: value(data, "codiceFiscale"),
      indirizzo: value(data, "indirizzo"),
      citta: value(data, "citta"),
      cap: value(data, "cap"),
      email: value(data, "email"),
      telefono: value(data, "telefono"),
      precedente: value(data, "precedente"),
      tipoTessera: value(data, "tipoTessera"),
      pagamento: value(data, "pagamento"),
      privacy: data.get("privacy") ? true : false,
    };

    // Disabilita il pulsante per evitare doppi invii.
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Invio in corso...";
    }
    setStatus("Invio in corso...", null);

    try {
      console.log("[FISI] Invio richiesta al backend...");
      const response = await fetch(API_BASE + "/api/fisi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      console.log("[FISI] Risposta backend:", response.status);

      let result = null;
      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (!response.ok || !result || !result.success) {
        const fieldMessage =
          result && result.fields ? Object.values(result.fields)[0] : null;
        const message =
          fieldMessage ||
          (result && result.error) ||
          "Errore del server (HTTP " + response.status + ").";
        console.warn("[FISI] Richiesta rifiutata:", message);
        setStatus(message, "is-error");
        return; // il form NON viene svuotato in caso di errore
      }

      console.log("[FISI] Successo:", result);
      setStatus("Richiesta inviata correttamente.", "is-ok");
      form.reset(); // svuota il form SOLO dopo un invio riuscito
    } catch (error) {
      console.error("[FISI] Errore di rete:", error);
      setStatus(
        "Impossibile contattare il server. Verifica la connessione e riprova.",
        "is-error"
      );
    } finally {
      // Riabilita sempre il pulsante e ne ripristina l'etichetta originale.
      if (submitButton) {
        submitButton.disabled = false;
        if (submitButton.dataset.originalText) {
          submitButton.innerHTML = submitButton.dataset.originalText;
        }
      }
    }
  });
})();
