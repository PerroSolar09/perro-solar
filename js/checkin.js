/* Configuración pública de Supabase. La anon key es pública; nunca pongas aquí service_role. */
const SUPABASE_URL = "https://gphizrvkvxfywttysnfj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable__yjcN8rkR_ueEdZVpcj4Dw_xWc6nuOj";

const { createClient } = window.supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginPanel = document.getElementById("login-panel");
const scannerPanel = document.getElementById("scanner-panel");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const scanMessage = document.getElementById("scan-message");
const operatorEmail = document.getElementById("operator-email");
const manualForm = document.getElementById("manual-form");
let qrScanner;
let validating = false;

function showMessage(element, message, state = "") {
  element.textContent = message;
  element.className = "message " + state;
}

async function setSessionUI(session) {
  if (!session) {
    if (qrScanner) {
      try { await qrScanner.stop(); } catch (_) {}
      qrScanner = null;
    }
    loginPanel.hidden = false;
    scannerPanel.hidden = true;
    return;
  }
  loginPanel.hidden = true;
  scannerPanel.hidden = false;
  operatorEmail.textContent = session.user.email || "Operador autorizado";
  startScanner();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(loginMessage, "Verificando acceso…");
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: document.getElementById("email").value.trim(),
    password: document.getElementById("password").value
  });
  if (error) {
    showMessage(loginMessage, "No fue posible iniciar sesión. Verifica tus datos y autorización.", "error");
    return;
  }
  await setSessionUI(data.session);
});

document.getElementById("logout-button").addEventListener("click", async () => {
  if (qrScanner) {
    try { await qrScanner.stop(); } catch (_) {}
    qrScanner = null;
  }
  await supabaseClient.auth.signOut();
  await setSessionUI(null);
});

async function validateQr(qrToken) {
  if (validating) return;
  validating = true;
  if (qrScanner) {
    try { await qrScanner.pause(true); } catch (_) {}
  }
  showMessage(scanMessage, "Validando boleta…");
  const { data, error } = await supabaseClient.functions.invoke("validate-ticket-qr", {
    body: { qr_token: qrToken }
  });
  if (error) {
    showMessage(scanMessage, "Error de conexión. No se confirmó el ingreso; intenta nuevamente.", "error");
  } else if (data?.success && data.status === "accepted") {
    showMessage(scanMessage, "INGRESO AUTORIZADO · " + (data.ticket_code || ""), "success");
  } else if (data?.status === "already_used") {
    showMessage(scanMessage, "BOLETA YA UTILIZADA · " + (data.ticket_code || ""), "error");
  } else {
    showMessage(scanMessage, data?.message || "Boleta no válida", "error");
  }
  window.setTimeout(() => {
    validating = false;
    if (qrScanner) {
      try { qrScanner.resume(); } catch (_) {}
    }
  }, 2500);
}

function startScanner() {
  if (qrScanner || !window.Html5Qrcode) return;
  qrScanner = new Html5Qrcode("qr-reader");
  qrScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 240, height: 240 } },
    (decodedText) => validateQr(decodedText),
    () => {}
  ).catch(() => showMessage(scanMessage, "No se pudo abrir la cámara. Usa el ingreso manual.", "error"));
}

document.getElementById("manual-button").addEventListener("click", () => {
  manualForm.hidden = !manualForm.hidden;
});
manualForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = document.getElementById("manual-token").value.trim();
  if (token) await validateQr(token);
});

supabaseClient.auth.getSession().then(({ data }) => setSessionUI(data.session));
supabaseClient.auth.onAuthStateChange((_event, session) => setSessionUI(session));
