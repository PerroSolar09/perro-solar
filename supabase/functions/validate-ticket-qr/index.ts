// Perro Solar — secure ticket QR check-in endpoint
// Requires a valid Supabase Auth JWT whose app_metadata.ticket_staff is true.
// The service-role key remains server-side and is never returned to the browser.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return respond({ success: false, message: "Método no permitido" }, 405);
  }

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return respond({ success: false, message: "Sesión requerida" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond({ success: false, message: "Configuración del servidor incompleta" }, 500);
  }

  const token = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(token);

  if (authError || !userData.user) {
    return respond({ success: false, message: "Sesión inválida o vencida" }, 401);
  }

  const metadata = userData.user.app_metadata ?? {};
  if (metadata.ticket_staff !== true && metadata.role !== "ticket_staff") {
    return respond({ success: false, message: "No tienes permiso para validar boletas" }, 403);
  }

  let body: { qr_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return respond({ success: false, message: "Solicitud JSON inválida" }, 400);
  }

  if (typeof body.qr_token !== "string" || body.qr_token.length < 32 || body.qr_token.length > 512) {
    return respond({ success: false, message: "Código QR inválido" }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await serviceClient.rpc("validate_ticket_qr", {
    p_qr_token: body.qr_token,
  });

  if (error) {
    console.error("validate_ticket_qr failed:", error.message);
    return respond({ success: false, message: "No fue posible validar la boleta" }, 500);
  }

  return respond(data);
});
