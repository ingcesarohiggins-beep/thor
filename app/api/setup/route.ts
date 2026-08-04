import { getSupabaseAdmin } from "../../../db/supabase";
import { requireAuthenticatedUser } from "../_lib/auth";

export async function GET() {
  try {
    const { count, error } = await getSupabaseAdmin().from("app_users").select("id", { count: "exact", head: true });
    if (error) throw error;
    return Response.json({ initialized: (count ?? 0) > 0 });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireAuthenticatedUser(request);
    const db = getSupabaseAdmin();
    const { count, error: countError } = await db.from("app_users").select("id", { count: "exact", head: true });
    if (countError) throw countError;
    if ((count ?? 0) > 0) return Response.json({ error: "THOR ya fue configurado. Pide al administrador que habilite tu usuario." }, { status: 409 });
    const location = await db.from("locations").insert({ name: "Almacén Central", type: "central", active: true }).select("id").single();
    if (location.error || !location.data) throw location.error ?? new Error("No se pudo crear el almacén central.");
    const email = identity.email ?? "admin@thor.local";
    const username = (email.split("@")[0] || "admin").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 36) || "admin";
    const user = await db.from("app_users").insert({ auth_user_id: identity.id, name: identity.user_metadata.full_name || identity.user_metadata.name || email, email, username, role: "superadmin", location_id: location.data.id, active: true }).select("id, role").single();
    if (user.error || !user.data) throw user.error ?? new Error("No se pudo crear el superadministrador.");
    return Response.json({ locationId: location.data.id, userId: user.data.id, role: user.data.role }, { status: 201 });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo preparar la base de datos.";
}
