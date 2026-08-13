import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Sesion requerida.");
    const url = Deno.env.get("SUPABASE_URL")!;
    const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerClient = createClient(url, publishableKey, { global: { headers: { Authorization: authorization } } });
    const adminClient = createClient(url, serviceRoleKey);
    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) throw new Error("Sesion invalida.");

    const { data: caller, error: callerError } = await adminClient
      .from("app_users")
      .select("id, role, location_id, active")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (callerError || !caller?.active || !["superadmin", "admin"].includes(caller.role)) throw new Error("No tienes permiso para crear usuarios.");

    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const requestedRole = String(body.role ?? "seller");
    const locationId = String(body.locationId ?? caller.location_id);
    if (!name || !email || password.length < 8) throw new Error("Completa nombre, correo y una contrasena de al menos 8 caracteres.");
    if (!['seller', 'admin'].includes(requestedRole)) throw new Error("Rol invalido.");
    if (caller.role !== "superadmin" && requestedRole !== "seller") throw new Error("Un administrador solo puede crear vendedores.");
    const { data: location, error: locationError } = await adminClient
      .from("locations")
      .select("id")
      .eq("id", locationId)
      .eq("active", true)
      .maybeSingle();
    if (locationError || !location) throw new Error("La sede seleccionada no está disponible.");

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (createError || !created.user) throw createError ?? new Error("No se pudo crear la cuenta.");

    const username = `${email.split("@")[0].replace(/[^a-z0-9._-]/gi, "").toLowerCase()}-${created.user.id.slice(0, 6)}`;
    const { data: profile, error: profileError } = await adminClient.from("app_users").insert({
      auth_user_id: created.user.id,
      name,
      email,
      username,
      role: requestedRole,
      location_id: locationId,
      active: true,
    }).select("id").single();
    if (profileError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }
    await adminClient.from("audit_log").insert({
      actor_id: caller.id,
      action: "user.created",
      entity_type: "app_user",
      entity_id: profile.id,
      detail: { name, email, role: requestedRole, location_id: locationId },
    });

    return Response.json({ ok: true }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo crear el usuario." }, { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
