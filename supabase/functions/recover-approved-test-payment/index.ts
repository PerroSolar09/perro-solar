import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = { "Content-Type": "application/json" };

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  try {
    // This endpoint is intentionally restricted to the single approved Sandbox test.
    const recoverySecret = Deno.env.get("TICKET_RECOVERY_SECRET");
    const privateKey = Deno.env.get("WOMPI_PRIVATE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    const legacyServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const suppliedSecret = req.headers.get("x-recovery-secret");
    if (!recoverySecret || !suppliedSecret || suppliedSecret !== recoverySecret) {
      return reply(401, { error: "Unauthorized" });
    }

    let serviceKey = legacyServiceKey;
    if (!serviceKey && secretKeysRaw) {
      const secretKeys = JSON.parse(secretKeysRaw);
      serviceKey = secretKeys.default;
    }
    if (!privateKey || !supabaseUrl || !serviceKey) {
      return reply(500, { error: "Missing server configuration" });
    }

    const body = await req.json().catch(() => ({}));
    const transactionId = body.transaction_id;
    const expectedTransactionId = "12244543-1793810821-30422";
    const expectedReference = "PS-d92f1428-119e-4f61-bc97-e164154964e8";
    const expectedAmount = 1000000;

    if (transactionId !== expectedTransactionId) {
      return reply(400, { error: "Transaction is not allowlisted for this recovery" });
    }

    const wompiResponse = await fetch(
      `https://sandbox.wompi.co/v1/transactions/${encodeURIComponent(expectedTransactionId)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${privateKey}`,
          Accept: "application/json",
        },
      },
    );

    if (!wompiResponse.ok) {
      console.error("Wompi verification failed:", wompiResponse.status);
      return reply(502, { error: "Could not verify transaction with Wompi Sandbox" });
    }

    const wompiPayload = await wompiResponse.json();
    const tx = wompiPayload?.data;
    if (
      !tx ||
      tx.id !== expectedTransactionId ||
      tx.status !== "APPROVED" ||
      tx.currency !== "COP" ||
      tx.reference !== expectedReference ||
      tx.amount_in_cents !== expectedAmount
    ) {
      return reply(409, { error: "Wompi transaction did not match the approved test payment" });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const orderId = expectedReference.slice(3);
    const { data, error } = await supabase.rpc("confirm_ticket_payment", {
      p_order_id: orderId,
      p_provider_transaction_id: expectedTransactionId,
    });

    if (error) {
      console.error("Ticket payment confirmation failed:", error.message);
      return reply(500, { error: "Payment verified, but ticket confirmation failed" });
    }
    if (!data || data.success !== true) {
      return reply(500, { error: "Unexpected ticket confirmation result" });
    }
    if (data.tickets_issued !== true) {
      return reply(409, {
        payment_verified: true,
        tickets_issued: false,
        refund_required: data.refund_required === true,
        message: "Payment is approved, but tickets were not issued. Manual review is required.",
      });
    }

    const emailSecret = Deno.env.get("TICKET_EMAIL_INTERNAL_SECRET");
    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-ticket-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ticket-email-secret": emailSecret!,
      },
      body: JSON.stringify({ order_id: orderId }),
    });

    if (!emailResponse.ok) {
      console.error("Ticket email failed:", emailResponse.status, await emailResponse.text());
      return reply(200, {
        payment_verified: true,
        tickets_issued: true,
        email_sent: false,
        order_id: orderId,
        message: "Tickets were issued; email delivery needs follow-up.",
      });
    }

    const emailResult = await emailResponse.json();
    return reply(200, {
      payment_verified: true,
      tickets_issued: true,
      email_sent: emailResult.success === true,
      order_id: orderId,
      ticket_count: emailResult.tickets_sent ?? null,
      already_processed: data.already_processed === true,
    });
  } catch (error) {
    console.error("Recovery endpoint error:", error instanceof Error ? error.message : "Unknown error");
    return reply(500, { error: "Internal recovery error" });
  }
});
