import { getSupabaseAdmin } from "../../../db/supabase";
import { requireActor } from "../_lib/auth";

const maxBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Selecciona una foto." }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ error: "Solo se aceptan imágenes." }, { status: 400 });
    if (file.size > maxBytes) return Response.json({ error: "La foto supera 5 MB." }, { status: 400 });
    const extension = file.type.split("/")[1] || "jpg";
    const key = `uploads/${actor.id}/${crypto.randomUUID()}.${extension}`;
    const { error } = await getSupabaseAdmin().storage.from("thor-files").upload(key, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return Response.json({ key }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la foto." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    await requireActor(request);
    const key = new URL(request.url).searchParams.get("key");
    if (!key || !key.startsWith("uploads/")) return new Response("No encontrado", { status: 404 });
    const { data, error } = await getSupabaseAdmin().storage.from("thor-files").createSignedUrl(key, 3600);
    if (error || !data) throw error ?? new Error("No encontrado");
    return Response.redirect(data.signedUrl, 302);
  } catch {
    return new Response("No autorizado", { status: 401 });
  }
}
