//==================================================
// MENÚ HAMBURGUESA
//==================================================

const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("nav");

if (menuToggle && nav) {
    menuToggle.addEventListener("click", () => nav.classList.toggle("active"));
    nav.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => nav.classList.remove("active"));
    });
}

//==================================================
// BOLETERÍA — PRUEBA LOCAL AISLADA
// La venta pública permanece deshabilitada.
//==================================================

(() => {
    const form = document.querySelector("#presale-form");
    if (!form) return;

    const status = document.querySelector("#presale-status");
    const button = document.querySelector("#presale-submit");
    const nameField = document.querySelector("#buyer-name");
    const emailField = document.querySelector("#buyer-email");
    const quantityField = document.querySelector("#ticket-quantity");

    const LOCAL_TEST_ORIGINS = new Set([
        "http://localhost:5500",
        "http://localhost:5501",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:5501"
    ]);
    const LOCAL_TEST_ORIGIN = LOCAL_TEST_ORIGINS.has(window.location.origin);
    const API_URL = "https://gphizrvkvxfywttysnfj.supabase.co/functions/v1/create-ticket-order";

    if (!LOCAL_TEST_ORIGIN) {
        if (status) status.textContent = "La preventa pública permanece deshabilitada mientras terminamos las pruebas de seguridad y pagos.";
        return;
    }

    [nameField, emailField, quantityField, button].forEach((element) => {
        if (element) element.disabled = false;
    });

    button.textContent = "PROBAR COMPRA · SANDBOX";
    button.classList.add("is-test-ready");
    status.textContent = "ENTORNO LOCAL DE PRUEBAS. Se creará una reserva del evento técnico y se abrirá Wompi Sandbox.";

    let requestInProgress = false;
    let idempotencyKey = null;

    function message(text, isError = false) {
        status.textContent = text;
        status.dataset.state = isError ? "error" : "info";
    }

    function hidden(formElement, name, value) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value);
        formElement.appendChild(input);
    }

    function openWompiCheckout(data, buyerName, buyerEmail) {
        // La Edge Function debe devolver estos campos calculados en servidor.
        const required = ["public_key", "currency", "amount_in_cents", "reference", "signature_integrity"];
        for (const key of required) {
            if (data[key] === undefined || data[key] === null || data[key] === "") {
                throw new Error("Respuesta incompleta del servidor: falta " + key);
            }
        }

        const checkoutForm = document.createElement("form");
        checkoutForm.method = "GET";
        checkoutForm.action = "https://checkout.wompi.co/p/";
        checkoutForm.hidden = true;

        hidden(checkoutForm, "public-key", data.public_key);
        hidden(checkoutForm, "currency", data.currency);
        hidden(checkoutForm, "amount-in-cents", data.amount_in_cents);
        hidden(checkoutForm, "reference", data.reference);
        hidden(checkoutForm, "signature:integrity", data.signature_integrity);
        hidden(checkoutForm, "customer-data:email", buyerEmail);
        hidden(checkoutForm, "customer-data:full-name", buyerName);

        document.body.appendChild(checkoutForm);
        checkoutForm.submit();
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (requestInProgress || !form.reportValidity()) return;

        const buyerName = nameField.value.trim();
        const buyerEmail = emailField.value.trim().toLowerCase();
        const quantity = Number(quantityField.value);
        const turnstileToken = window.turnstile?.getResponse?.();

        if (!turnstileToken) {
            message("Completa la verificación de Cloudflare antes de continuar.", true);
            return;
        }

        if (!idempotencyKey) {
            if (!window.crypto?.randomUUID) {
                message("Este navegador no permite generar una clave segura para la solicitud.", true);
                return;
            }
            idempotencyKey = window.crypto.randomUUID();
        }

        requestInProgress = true;
        button.disabled = true;
        button.textContent = "PREPARANDO RESERVA…";
        message("Validando la solicitud y creando la reserva de prueba…");

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: buyerName,
                    email: buyerEmail,
                    quantity,
                    turnstile_token: turnstileToken,
                    idempotency_key: idempotencyKey
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || data.message || "El servidor rechazó la solicitud (HTTP " + response.status + ").");
            }

            openWompiCheckout(data, buyerName, buyerEmail);
        } catch (error) {
            console.error("Error en la prueba de boletería:", error);
            message(error.message || "No fue posible iniciar la prueba.", true);
            requestInProgress = false;
            button.disabled = false;
            button.textContent = "REINTENTAR · SANDBOX";
            if (window.turnstile?.reset) window.turnstile.reset();
        }
    });
})();