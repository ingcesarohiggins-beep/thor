import { getSupabaseAdmin } from "../../../db/supabase";

/** Comprueba la conexión sin revelar claves ni datos internos. */
export async function GET() {
  try {
    const { error } = await getSupabaseAdmin().from("locations").select("id", { head: true, count: "exact" });
    if (error) throw error;
    return Response.json({ connected: true, provider: "supabase" });
  } catch (error) {
    return Response.json(
      { connected: false, provider: "supabase", error: error instanceof Error ? error.message : "No se pudo conectar." },
      { status: 503 }
    );
  }
}
