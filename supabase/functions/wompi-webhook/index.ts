import { createClient } from "npm:@supabase/supabase-js@2";

// =====================================================
// 1. RESPUESTAS Y UTILIDADES
// =====================================================

const corsHeaders = {
  "Content-Type": "application/json",
};

function response(
  status: number,
  body: Record<string, unknown>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function getNestedValue(
  obj: unknown,
  path: string,
): unknown {
  return path.split(".").reduce((value: any, key) => {
    if (value === null || value === undefined) {
      return undefined;
    }
    return value[key];
  }, obj);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

// =====================================================
// 2. WEBHOOK DE WOMPI
// =====================================================

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return response(405, {
      error: "Método no permitido",
    });
  }

  try {
    // =================================================
    // 3. CONFIGURACIÓN
    // =================================================

    const wompiEnvironment = Deno.env.get("WOMPI_ENVIRONMENT")?.trim() || "prod";
    const eventsSecret = Deno.env.get("WOMPI_EVENTS_SECRET");
    const privateKey = Deno.env.get("WOMPI_PRIVATE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    if (!["test", "prod"].includes(wompiEnvironment)) {
      return response(500, {
        error: "WOMPI_ENVIRONMENT debe ser test o prod",
      });
    }
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    const legacyServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const emailInternalSecret = Deno.env.get("TICKET_EMAIL_INTERNAL_SECRET");

    let serviceKey = legacyServiceKey;

    if (!serviceKey && secretKeysRaw) {
      const secretKeys = JSON.parse(secretKeysRaw);
      serviceKey = secretKeys.default;
    }

    if (
      !eventsSecret ||
      !privateKey ||
      !supabaseUrl ||
      !serviceKey ||
      !emailInternalSecret
    ) {
      console.error("Falta configurar uno o más secretos.");

      return response(500, {
        error: "Configuración incompleta",
      });
    }

    // =================================================
    // 4. LEER EVENTO
    // =================================================

    const event = await req.json();

    if (event.event !== "transaction.updated") {
      return response(200, {
        received: true,
        ignored: true,
      });
    }

    if (event.environment !== wompiEnvironment) {
      return response(400, {
        error: "Ambiente no permitido",
      });
    }

    // =================================================
    // 5. VERIFICAR FIRMA
    // =================================================

    const properties = event.signature?.properties;

    const receivedChecksum = String(
      event.signature?.checksum ?? "",
    ).toUpperCase();

    if (
      !Array.isArray(properties) ||
      properties.length === 0 ||
      !receivedChecksum ||
      !Number.isInteger(event.timestamp)
    ) {
      return response(400, {
        error: "Firma incompleta",
      });
    }

    let signatureContent = "";

    for (const property of properties) {
      if (typeof property !== "string") {
        return response(400, {
          error: "Propiedad inválida",
        });
      }

      const value = getNestedValue(event.data, property);

      if (
        value === undefined ||
        value === null ||
        typeof value === "object"
      ) {
        return response(400, {
          error: "Datos de firma inválidos",
        });
      }

      signatureContent += String(value);
    }

    signatureContent += String(event.timestamp);
    signatureContent += eventsSecret;

    const calculatedChecksum = await sha256(signatureContent);

    if (!safeEqual(calculatedChecksum, receivedChecksum)) {
      console.error("Firma de Wompi no válida.");

      return response(401, {
        error: "Firma no válida",
      });
    }

    // =================================================
    // 6. IDENTIFICAR TRANSACCIÓN
    // =================================================

    const notifiedTransaction = event.data?.transaction;
    const transactionId = notifiedTransaction?.id;

    if (!transactionId || typeof transactionId !== "string") {
      return response(400, {
        error: "Transacción sin identificador",
      });
    }

    if (notifiedTransaction.status !== "APPROVED") {
      return response(200, {
        received: true,
        approved: false,
        status: notifiedTransaction.status,
      });
    }

    // =================================================
    // 7. VERIFICAR TRANSACCIÓN DIRECTAMENTE EN WOMPI
    // =================================================

    const wompiApiBase = wompiEnvironment === "test"
      ? "https://sandbox.wompi.co/v1"
      : "https://production.wompi.co/v1";

    const wompiResponse = await fetch(
      `${wompiApiBase}/transactions/${encodeURIComponent(transactionId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${privateKey}`,
          Accept: "application/json",
        },
      },
    );

    if (!wompiResponse.ok) {
      console.error(
        "No se pudo verificar la transacción:",
        wompiResponse.status,
      );

      return response(502, {
        error: "No fue posible verificar el pago",
      });
    }

    const wompiResult = await wompiResponse.json();
    const transaction = wompiResult.data;

    if (
      !transaction ||
      transaction.id !== transactionId ||
      transaction.status !== "APPROVED" ||
      transaction.currency !== "COP" ||
      transaction.reference !== notifiedTransaction.reference ||
      transaction.amount_in_cents !== notifiedTransaction.amount_in_cents
    ) {
      console.error("Los datos de la transacción no coinciden.");

      return response(400, {
        error: "Transacción no coincidente",
      });
    }

    if (
      typeof transaction.reference !== "string" ||
      !transaction.reference.startsWith("PS-")
    ) {
      return response(400, {
        error: "Referencia inválida",
      });
    }

    const orderId = transaction.reference.slice(3);

    // =================================================
    // 8. CONFIRMAR PAGO EN SUPABASE
    // =================================================

    const supabase = createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data, error } = await supabase.rpc(
      "confirm_ticket_payment",
      {
        p_order_id: orderId,
        p_provider_transaction_id: transactionId,
      },
    );

    if (error) {
      console.error(
        "Error al confirmar el pago:",
        error.message,
      );

      return response(500, {
        error: "No se pudo confirmar la orden",
      });
    }

    if (!data || data.success !== true) {
      console.error("Respuesta inesperada de confirmación.");

      return response(500, {
        error: "Confirmación de pago no válida",
      });
    }

    // =================================================
    // 9. PAGO APROBADO SIN CUPOS DISPONIBLES
    // =================================================

    if (data.tickets_issued === false) {
      console.error(
        "PAGO APROBADO SIN BOLETAS. REQUIERE DEVOLUCIÓN MANUAL.",
        {
          order_id: orderId,
          transaction_id: transactionId,
        },
      );

      // No enviar correo ni generar boletas.
      // El caso queda identificado por la orden vencida
      // y el pago aprobado en Supabase.
      return response(200, {
        received: true,
        approved: true,
        tickets_sent: false,
        refund_required: true,
        reason: "capacity_unavailable",
        order_id: orderId,
        transaction_id: transactionId,
      });
    }

    if (data.tickets_issued !== true) {
      console.error("Estado de emisión de boletas desconocido.");

      return response(500, {
        error: "No se pudo determinar el estado de las boletas",
      });
    }

    // =================================================
    // 10. ENVIAR BOLETAS POR CORREO
    // =================================================

    const emailResponse = await fetch(
      `${supabaseUrl}/functions/v1/send-ticket-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ticket-email-secret": emailInternalSecret,
        },
        body: JSON.stringify({
          order_id: orderId,
        }),
      },
    );

    if (!emailResponse.ok) {
      const emailError = await emailResponse.text();

      console.error(
        "Error al enviar boletas:",
        emailResponse.status,
        emailError,
      );

      return response(500, {
        received: true,
        approved: true,
        order_id: orderId,
        tickets_sent: false,
        error: "Pago confirmado, pero falta enviar las boletas",
      });
    }

    const emailResult = await emailResponse.json();

    if (!emailResult.success) {
      console.error("El servicio de correo no confirmó el envío.");

      return response(500, {
        received: true,
        approved: true,
        order_id: orderId,
        tickets_sent: false,
        error: "No se confirmó el envío de las boletas",
      });
    }

    // =================================================
    // 11. RESPUESTA FINAL
    // =================================================

    return response(200, {
      received: true,
      approved: true,
      order_id: orderId,
      tickets_sent: true,
      tickets_count: emailResult.tickets_sent,
      already_processed: data.already_processed === true,
      email_already_sent: emailResult.already_sent === true,
    });

  } catch (error) {
    console.error(
      "Error interno en webhook:",
      error instanceof Error ? error.message : "Error desconocido",
    );

    return response(500, {
      error: "Error interno",
    });
  }
});