import { getSupabaseAdmin } from "../../../db/supabase";

export type Actor = {
  id: string;
  name: string;
  role: "superadmin" | "admin" | "seller";
  locationId: string | null;
  email: string | null;
};

export async function requireAuthenticatedUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new Error("Debes iniciar sesión para continuar.");
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) throw new Error("Tu sesión ya no es válida. Ingresa nuevamente.");
  return data.user;
}

export async function requireActor(request: Request): Promise<Actor> {
  const user = await requireAuthenticatedUser(request);
  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .select("id, name, role, location_id, email, active")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.active) throw new Error("Tu cuenta THOR aún no está habilitada.");
  return { id: data.id, name: data.name, role: data.role, locationId: data.location_id, email: data.email };
}

export function requireRole(actor: Actor, roles: Actor["role"][]) {
  if (!roles.includes(actor.role)) throw new Error("No tienes permisos para esta operación.");
}
