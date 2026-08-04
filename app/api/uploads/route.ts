import { env } from "cloudflare:workers";
import { requireActor } from "../_lib/actor";

type StorageEnv = { FILES?: R2Bucket };
const maxBytes = 5 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const actor = await requireActor();
    const storage = env as unknown as StorageEnv;
    if (!storage.FILES) throw new Error("El almacenamiento de archivos no está disponible.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Selecciona una foto." }, { status: 400 });
    if (!file.type.startsWith("image/")) return Response.json({ error: "Solo se aceptan imágenes." }, { status: 400 });
    if (file.size > maxBytes) return Response.json({ error: "La foto supera 5 MB." }, { status: 400 });

    const extension = file.type.split("/")[1] || "jpg";
    const key = `uploads/${actor.id}/${crypto.randomUUID()}.${extension}`;
    await storage.FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    return Response.json({ key }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar la foto." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    await requireActor();
    const storage = env as unknown as StorageEnv;
    const key = new URL(request.url).searchParams.get("key");
    if (!storage.FILES || !key || !key.startsWith("uploads/")) return new Response("No encontrado", { status: 404 });
    const object = await storage.FILES.get(key);
    if (!object) return new Response("No encontrado", { status: 404 });
    return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "application/octet-stream", "cache-control": "private, max-age=3600" } });
  } catch {
    return new Response("No autorizado", { status: 401 });
  }
}
