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
// BOLETERÍA — CHECKOUT WOMPI PRODUCCIÓN
//==================================================

(() => {
    const form = document.querySelector("#presale-form");
    if (!form) return;

    const status = document.querySelector("#presale-status");
    const button = document.querySelector("#presale-submit");
    const nameField = document.querySelector("#buyer-name");
    const emailField = document.querySelector("#buyer-email");
    const quantityField = document.querySelector("#ticket-quantity");

    const API_URL = "https://gphizrvkvxfywttysnfj.supabase.co/functions/v1/create-ticket-order";
    const ALLOWED_ORIGINS = new Set([
        "https://perrosolar.com",
        "https://www.perrosolar.com"
    ]);

    // Mantener en false hasta verificar webhook, correo y una compra controlada.
    const PUBLIC_SALES_ENABLED = false;

    function message(text, isError = false) {
        if (!status) return;
        status.textContent = text;
        status.dataset.state = isError ? "error" : "info";
    }

    if (!ALLOWED_ORIGINS.has(window.location.origin)) {
        message("La compra solo está disponible desde el sitio oficial de Perro Solar.", true);
        return;
    }

    if (!PUBLIC_SALES_ENABLED) {
        message("La preventa estará disponible próximamente. Estamos finalizando las verificaciones de pago y emisión de boletas.");
        return;
    }

    if (!form.reportValidity || !button || !status || !nameField || !emailField || !quantityField) {
        console.error("No se encontró la estructura completa del formulario de preventa.");
        return;
    }

    [nameField, emailField, quantityField, button].forEach((element) => {
        element.disabled = false;
    });

    button.textContent = "COMPRAR ENTRADAS";

    let requestInProgress = false;
    let idempotencyKey = null;

    function hidden(formElement, name, value) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value);
        formElement.appendChild(input);
    }

    function openWompiCheckout(data, buyerName, buyerEmail) {
        const checkout = data.checkout;
        const required = [
            "public_key",
            "currency",
            "amount_in_cents",
            "reference",
            "signature_integrity"
        ];

        for (const key of required) {
            if (!checkout || checkout[key] === undefined || checkout[key] === null || checkout[key] === "") {
                throw new Error("Respuesta incompleta del servidor: falta " + key);
            }
        }

        const checkoutForm = document.createElement("form");
        checkoutForm.method = "GET";
        checkoutForm.action = checkout.url || "https://checkout.wompi.co/p/";
        checkoutForm.hidden = true;

        hidden(checkoutForm, "public-key", checkout.public_key);
        hidden(checkoutForm, "currency", checkout.currency);
        hidden(checkoutForm, "amount-in-cents", checkout.amount_in_cents);
        hidden(checkoutForm, "reference", checkout.reference);
        hidden(checkoutForm, "signature:integrity", checkout.signature_integrity);
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
            message("Completa la verificación de seguridad antes de continuar.", true);
            return;
        }

        if (!idempotencyKey) {
            if (!window.crypto?.randomUUID) {
                message("Este navegador no permite generar una clave segura para la compra.", true);
                return;
            }
            idempotencyKey = window.crypto.randomUUID();
        }

        requestInProgress = true;
        button.disabled = true;
        button.textContent = "PREPARANDO COMPRA…";
        message("Validando tus datos y reservando las entradas…");

        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    buyer_name: buyerName,
                    buyer_email: buyerEmail,
                    quantity,
                    turnstile_token: turnstileToken,
                    idempotency_key: idempotencyKey
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || data.message || "No fue posible iniciar la compra (HTTP " + response.status + ").");
            }

            message("Reserva creada. Abriendo el pago seguro de Wompi…");
            openWompiCheckout(data, buyerName, buyerEmail);
        } catch (error) {
            console.error("Error en la compra de boletería:", error);
            message(error.message || "No fue posible iniciar la compra. Inténtalo nuevamente.", true);
            requestInProgress = false;
            button.disabled = false;
            button.textContent = "REINTENTAR COMPRA";
            if (window.turnstile?.reset) window.turnstile.reset();

            // Una respuesta 409 puede indicar una reserva anterior vencida.
            // La siguiente solicitud debe tener una nueva clave de idempotencia.
            if (error.message?.includes("reserva") || error.message?.includes("orden")) {
                idempotencyKey = null;
            }
        }
    });
})();
