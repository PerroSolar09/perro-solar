import { createClient } from "npm:@supabase/supabase-js@2";
import QRCode from "npm:qrcode@1.5.4";

// Escapar contenido dinámico antes de insertarlo en HTML.
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json(
      { error: "Método no permitido" },
      { status: 405 },
    );
  }

  try {
    // 1. Autorización interna.
    const internalSecret = Deno.env.get(
      "TICKET_EMAIL_INTERNAL_SECRET",
    );

    const receivedSecret = req.headers.get(
      "x-ticket-email-secret",
    );

    if (
      !internalSecret ||
      !receivedSecret ||
      receivedSecret !== internalSecret
    ) {
      return Response.json(
        { error: "No autorizado" },
        { status: 401 },
      );
    }

    // 2. Configuración privada.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    const appsScriptUrl = Deno.env.get("GOOGLE_APPS_SCRIPT_URL");
    const appsScriptSecret = Deno.env.get(
      "GOOGLE_APPS_SCRIPT_SECRET",
    );

    if (
      !supabaseUrl ||
      !secretKeysRaw ||
      !appsScriptUrl ||
      !appsScriptSecret
    ) {
      throw new Error("Configuración incompleta");
    }

    const secretKeys = JSON.parse(secretKeysRaw);
    const serviceKey = secretKeys.default;

    if (!serviceKey) {
      throw new Error("Clave de servicio no disponible");
    }

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

    // 3. Validar identificador de orden.
    const body = await req.json();
    const orderId = body.order_id;

    if (
      typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)
    ) {
      return Response.json(
        { error: "Identificador de orden inválido" },
        { status: 400 },
      );
    }

    // 4. Recuperar orden, boletas y QR mediante RPC segura.
    const { data, error } = await supabase.rpc(
      "get_ticket_email_data",
      {
        p_order_id: orderId,
      },
    );

    if (error || !data?.order || !Array.isArray(data.tickets)) {
      console.error("Error recuperando datos de boletas:", error?.message);
      throw new Error("No se pudieron recuperar las boletas");
    }

    const order = data.order;
    const tickets = data.tickets;

    if (order.status !== "paid") {
      return Response.json(
        { error: "La orden todavía no está pagada" },
        { status: 409 },
      );
    }

    if (tickets.length === 0 || tickets.length > 10) {
      throw new Error("Cantidad de boletas inválida");
    }

    // 5. Evitar procesar nuevamente boletas ya enviadas.
    if (tickets.every((ticket: any) => ticket.email_sent === true)) {
      return Response.json({
        success: true,
        order_id: orderId,
        tickets_sent: tickets.length,
        already_sent: true,
      });
    }

    // No enviar entradas canceladas o reembolsadas.
    if (tickets.some((ticket: any) => ticket.status !== "valid")) {
      throw new Error("La orden contiene boletas que no están vigentes");
    }

    // 6. Generar códigos QR e imágenes.
    const emailTickets = [];
    const inlineImages: Record<string, string> = {};

    for (let index = 0; index < tickets.length; index++) {
      const ticket = tickets[index];

      if (
        typeof ticket.qr_token !== "string" ||
        ticket.qr_token.length < 32
      ) {
        throw new Error("Token QR inválido o inexistente");
      }

      const contentId = `qr_${index + 1}`;

      const qrDataUrl = await QRCode.toDataURL(
        ticket.qr_token,
        {
          errorCorrectionLevel: "H",
          type: "image/png",
          width: 400,
          margin: 3,
        },
      );

      inlineImages[contentId] = qrDataUrl.split(",")[1];

      emailTickets.push({
        ticketCode: escapeHtml(ticket.ticket_code),
        contentId,
      });
    }

    // 7. Construir contenido del correo.
    const safeBuyerName = escapeHtml(order.buyer_name);

    const htmlTickets = emailTickets.map((ticket) => `
      <div style="background:#1b1b1b;padding:24px;margin:20px 0;text-align:center;border:1px solid #8d7135">
        <h2 style="color:#c9a44c;font-family:Georgia,serif">
          ${ticket.ticketCode}
        </h2>
        <img
          src="cid:${ticket.contentId}"
          width="220"
          height="220"
          alt="Código QR de entrada"
          style="display:block;margin:20px auto;background:#fff;padding:10px"
        />
        <p style="color:#ddd">Presenta este código QR en la entrada del evento.</p>
        <p style="color:#c9a44c">Cada QR permite un solo ingreso.</p>
      </div>
    `).join("");

    const eventPosterUrl = "https://perrosolar.com/images/flyers/LaEstacion_21_Noviembre_2026.webp";
    const totalPaid = Number(order.total_cop);
    const paidLabel = Number.isFinite(totalPaid) && totalPaid > 0
      ? totalPaid.toLocaleString("es-CO")
      : (tickets.length * 10000).toLocaleString("es-CO");

    const htmlBody = `
      <div style="background:#111;color:#eee;padding:30px 18px;font-family:Arial,sans-serif">
        <div style="max-width:600px;margin:auto">
          <h1 style="color:#c9a44c;text-align:center;font-family:Georgia,serif;letter-spacing:2px">
            PERRO SOLAR
          </h1>

          <div style="text-align:center;margin:8px auto 22px">
            <img
              src="${eventPosterUrl}"
              alt="Afiche del concierto de Perro Solar"
              width="160"
              style="display:block;width:30%;max-width:160px;min-width:110px;height:auto;margin:0 auto;border:1px solid #8d7135"
            />
          </div>

          <h2 style="color:#eee;text-align:center;font-family:Georgia,serif;font-weight:normal">
            Tu entrada está confirmada
          </h2>

          <p>Hola ${safeBuyerName},</p>
          <p>Tu pago fue confirmado. Esta es tu entrada para Perro Solar en La Estación Rock and Roll.</p>

          <div style="border-top:1px solid #8d7135;border-bottom:1px solid #8d7135;padding:16px 4px;margin:20px 0;text-align:center">
            <p style="margin:5px 0;color:#c9a44c;font-size:17px">SÁBADO 21 DE NOVIEMBRE DE 2026 · 9:00 PM</p>
            <p style="margin:7px 0;color:#eee">La Estación Rock and Roll</p>
            <p style="margin:5px 0;color:#bbb">Calle 132 #102-10 · Bogotá, Colombia</p>
            <p style="margin:12px 0">
              <a href="https://maps.app.goo.gl/izGrEkuuwdkvPyyg9" style="color:#c9a44c;text-decoration:underline">Ver ubicación en Google Maps</a>
            </p>
            <p style="margin:10px 0 0;color:#c9a44c">Valor pagado: $${paidLabel} COP</p>
          </div>

          ${htmlTickets}

          <p style="text-align:center;color:#c9a44c;font-size:14px">
            Presenta este código QR en la entrada. Cada QR permite un solo ingreso.
          </p>
          <p style="text-align:center;color:#aaa;font-size:12px;margin-top:24px">
            Conserva este correo y presenta tu código QR al ingresar.
          </p>
        </div>
      </div>
    `;

    const textBody = [
      `Hola ${order.buyer_name},`,
      "Tu pago fue confirmado.",
      "Estas son tus boletas para Perro Solar.",
      ...tickets.map((ticket: any) => ticket.ticket_code),
      "Sábado 21 de noviembre de 2026.",
      "Presenta cada código QR al ingresar.",
    ].join("\n");

    // 8. Enviar correo a Google Apps Script.
    const mailResponse = await fetch(appsScriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: appsScriptSecret,
        to: order.buyer_email,
        subject: "Tus boletas - Perro Solar | 21 de noviembre",
        textBody,
        htmlBody,
        inlineImages,
        idempotencyKey: `boletas-perro-solar-${orderId}`,
      }),
    });

    if (!mailResponse.ok) {
      throw new Error(
        `Google Apps Script respondió HTTP ${mailResponse.status}`,
      );
    }

    const mailResult = await mailResponse.json();

    if (!mailResult.success) {
      throw new Error(
        mailResult.error || "Google Apps Script no confirmó el envío",
      );
    }

    // 9. Registrar el envío mediante RPC segura.
    const { data: updatedCount, error: updateError } =
      await supabase.rpc(
        "mark_ticket_email_sent",
        {
          p_order_id: orderId,
        },
      );

    if (updateError) {
      console.error("Error registrando envío:", updateError.message);
      throw new Error("No se pudo actualizar el registro de envío");
    }

    return Response.json({
      success: true,
      order_id: orderId,
      tickets_sent: tickets.length,
      already_sent: mailResult.alreadySent === true,
      records_updated: updatedCount,
    });

  } catch (error) {
    console.error(
      "Error enviando boletas:",
      error instanceof Error ? error.message : "Error desconocido",
    );

    return Response.json(
      { error: "No fue posible completar el envío de las boletas" },
      { status: 500 },
    );
  }
});
