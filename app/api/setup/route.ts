import { count } from "drizzle-orm";
import { getDb } from "../../../db";
import { locations, users } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

const now = () => new Date().toISOString();

export async function GET() {
  try {
    const db = getDb();
    const [result] = await db.select({ value: count() }).from(users);
    return Response.json({ initialized: result.value > 0 });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const identity = await getChatGPTUser();
    if (!identity) return Response.json({ error: "Inicia sesión para configurar THOR." }, { status: 401 });

    const db = getDb();
    const [existing] = await db.select({ value: count() }).from(users);
    if (existing.value > 0) return Response.json({ error: "THOR ya fue configurado." }, { status: 409 });

    const timestamp = now();
    const locationId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const username = (identity.email.split("@")[0] || "admin").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 36) || "admin";
    await db.batch([
      db.insert(locations).values({ id: locationId, name: "Almacén Central", type: "central", active: true, createdAt: timestamp, updatedAt: timestamp }),
      db.insert(users).values({ id: userId, externalId: identity.userId, name: identity.fullName ?? identity.email, email: identity.email, username, role: "superadmin", locationId, active: true, createdAt: timestamp, updatedAt: timestamp }),
    ]);
    return Response.json({ locationId, userId, role: "superadmin" }, { status: 201 });
  } catch (error) {
    return Response.json({ error: message(error) }, { status: 500 });
  }
}

function message(error: unknown) {
  const text = error instanceof Error ? error.message : "No se pudo preparar la base de datos.";
  return text.includes("no such table") ? "La base de datos aún está preparando sus tablas. Intenta nuevamente en unos segundos." : text;
}
