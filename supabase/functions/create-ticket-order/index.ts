import { createClient } from "npm:@supabase/supabase-js@2";

// =====================================================
// 1. CONFIGURACIÓN
// =====================================================

const allowedOrigins = [
  "https://perrosolar.com",
  "https://www.perrosolar.com",
  "http://localhost:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5500",
  "http://127.0.0.1:5501"
];

const allowedHostnames = new Set([
    "perrosolar.com",
    "www.perrosolar.com",
    "localhost",
    "127.0.0.1"
]);

const EVENT_SLUG = "prueba-tecnica-perro-solar";
const WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/";

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string>,
) {
  return Response.json(body, { status, headers });
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// =====================================================
// 2. FUNCIÓN PRINCIPAL
// =====================================================

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";

  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };

  if (req.method === "OPTIONS") {
    if (!allowedOrigins.includes(origin)) {
      return new Response("Origen no permitido", {
        status: 403,
        headers: corsHeaders,
      });
    }

    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (!origin || !allowedOrigins.includes(origin)) {
    return new Response("Origen no permitido", {
      status: 403,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      405,
      { error: "Método no permitido" },
      corsHeaders,
    );
  }

  try {
    // =================================================
    // 3. LEER Y VALIDAR SOLICITUD
    // =================================================

    const body = await req.json();

    const turnstileToken = body.turnstile_token;

    if (
      typeof turnstileToken !== "string" ||
      turnstileToken.length === 0
    ) {
      return jsonResponse(
        400,
        { error: "Debes completar la verificación de seguridad." },
        corsHeaders,
      );
    }

    // =================================================
    // 4. CLOUDFLARE TURNSTILE
    // =================================================

    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");

    if (!turnstileSecret) {
      throw new Error("Falta TURNSTILE_SECRET_KEY");
    }

    const verificationForm = new URLSearchParams();
    verificationForm.set("secret", turnstileSecret);
    verificationForm.set("response", turnstileToken);

    const verificationResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: verificationForm.toString(),
      },
    );

    if (!verificationResponse.ok) {
      return jsonResponse(
        502,
        { error: "No fue posible verificar la seguridad." },
        corsHeaders,
      );
    }

    const verification = await verificationResponse.json();

    if (!verification.success) {
      return jsonResponse(
        403,
        { error: "Cloudflare rechazó la verificación." },
        corsHeaders,
      );
    }

    if (!allowedHostnames.has(verification.hostname)) {
      return jsonResponse(
        403,
        { error: "Dominio no autorizado." },
        corsHeaders,
      );
    }

    // =================================================
    // 5. VALIDAR COMPRADOR
    // =================================================

    const name = typeof body.buyer_name === "string"
  ? body.buyer_name.trim()
  : "";

    const email = typeof body.buyer_email === "string"
  ? body.buyer_email.trim().toLowerCase()
  : "";

    const quantity = body.quantity;

    const idempotencyKey =
      typeof body.idempotency_key === "string"
        ? body.idempotency_key.trim()
        : "";

    if (name.length < 2 || name.length > 120) {
      return jsonResponse(
        400,
        { error: "Nombre inválido." },
        corsHeaders,
      );
    }

    if (
      email.length < 5 ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return jsonResponse(
        400,
        { error: "Correo electrónico inválido." },
        corsHeaders,
      );
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    ) {
      return jsonResponse(
        400,
        { error: "Cantidad inválida. Máximo 10 entradas." },
        corsHeaders,
      );
    }

    if (
      idempotencyKey.length < 16 ||
      idempotencyKey.length > 200
    ) {
      return jsonResponse(
        400,
        { error: "Identificador de compra inválido." },
        corsHeaders,
      );
    }

    // =================================================
    // 6. CONFIGURACIÓN PRIVADA
    // =================================================

    // =================================================
// 6. CONFIGURACIÓN PRIVADA
// =================================================

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");

if (!supabaseUrl || !secretKeysRaw) {
  throw new Error("Falta configuración de Supabase.");
}

const secretKeys = JSON.parse(secretKeysRaw);
const serviceRoleKey = secretKeys.default;

if (!serviceRoleKey) {
  throw new Error("Falta la clave de servicio de Supabase.");
}

const supabase = createClient(
  supabaseUrl,
  serviceRoleKey
);

const publicKey = Deno.env.get("WOMPI_PUBLIC_KEY")?.trim();
const integritySecret = Deno.env.get("WOMPI_INTEGRITY_SECRET")?.trim();

if (!publicKey) {
  throw new Error("Falta el Secret WOMPI_PUBLIC_KEY.");
}

if (!publicKey.startsWith("pub_test_")) {
  throw new Error("WOMPI_PUBLIC_KEY no corresponde a Sandbox.");
}

if (!integritySecret) {
  throw new Error("Falta el Secret WOMPI_INTEGRITY_SECRET.");
}

    // =================================================
    // 7. CREAR RESERVA
    // =================================================

    const { data, error } = await supabase.rpc(
      "reserve_ticket_order",
      {
        p_event_slug: EVENT_SLUG,
        p_quantity: quantity,
        p_buyer_name: name,
        p_buyer_email: email,
        p_idempotency_key: idempotencyKey,
      },
    );

    if (error) {
      console.error("Error creando reserva:", {
        code: error.code,
        message: error.message,
      });

      return jsonResponse(
        409,
        { error: "No fue posible reservar las entradas." },
        corsHeaders,
      );
    }

    const order = Array.isArray(data) ? data[0] : data;

    if (!order?.order_id) {
      throw new Error("No se recibió un identificador de reserva.");
    }

    const orderId = String(order.order_id);
    const totalCop = Number(order.total_cop);
    const expiresAt = new Date(order.expires_at);

    if (
      !Number.isSafeInteger(totalCop) ||
      totalCop <= 0 ||
      Number.isNaN(expiresAt.getTime())
    ) {
      throw new Error("Datos de reserva inválidos.");
    }

    if (expiresAt.getTime() <= Date.now()) {
      return jsonResponse(
        409,
        { error: "La reserva ha vencido. Inicia una nueva compra." },
        corsHeaders,
      );
    }

    // =================================================
    // 8. CREAR O RECUPERAR PAGO PENDIENTE
    // =================================================

    const reference = `PS-${orderId}`;
    const amountInCents = totalCop * 100;

    if (!Number.isSafeInteger(amountInCents)) {
      throw new Error("Importe inválido para Wompi.");
    }

    const { error: insertPaymentError } = await supabase
      .from("payments")
      .upsert(
        {
          order_id: orderId,
          provider: "wompi",
          provider_reference: reference,
          amount_cop: totalCop,
          currency: "COP",
          status: "pending",
        },
        {
          onConflict: "provider_reference",
          ignoreDuplicates: true,
        },
      );

    if (insertPaymentError) {
      console.error("Error registrando pago:", {
        code: insertPaymentError.code,
        message: insertPaymentError.message,
      });

      throw new Error("No fue posible registrar el pago.");
    }

    // Recuperar el registro, incluso si ya existía por un reintento.
    const { data: payment, error: paymentReadError } = await supabase
      .from("payments")
      .select(
        "id, order_id, provider_reference, amount_cop, currency, status",
      )
      .eq("provider_reference", reference)
      .maybeSingle();

    if (paymentReadError || !payment) {
      throw new Error("No fue posible verificar el registro de pago.");
    }

    if (
      payment.order_id !== orderId ||
      payment.amount_cop !== totalCop ||
      payment.currency !== "COP"
    ) {
      throw new Error("El registro de pago no coincide con la reserva.");
    }

    if (payment.status !== "pending") {
      return jsonResponse(
        409,
        { error: "Esta orden ya no admite un nuevo intento de pago." },
        corsHeaders,
      );
    }

    // =================================================
    // 9. FIRMA DE INTEGRIDAD WOMPI
    // =================================================

    const signatureIntegrity = await sha256(
      reference +
      String(amountInCents) +
      "COP" +
      integritySecret
    );

    // =================================================
    // 10. RESPUESTA PARA EL CHECKOUT
    // =================================================

    return jsonResponse(
      200,
      {
        success: true,
        order_id: orderId,
        reference,
        total_cop: totalCop,
        amount_in_cents: amountInCents,
        currency: "COP",
        expires_at: expiresAt.toISOString(),

        checkout: {
          url: WOMPI_CHECKOUT_URL,
          public_key: publicKey,
          currency: "COP",
          amount_in_cents: amountInCents,
          reference,
          signature_integrity: signatureIntegrity,
        },

        message: "Reserva creada. Puedes continuar al pago.",
      },
      corsHeaders,
    );

  } catch (error) {
    console.error(
      "Error creando orden:",
      error instanceof Error ? error.message : "Error desconocido",
    );

    return jsonResponse(
      500,
      { error: "No fue posible procesar la solicitud." },
      corsHeaders,
    );
  }
});