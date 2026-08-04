import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { users } from "../../../db/schema";
import { getChatGPTUser } from "../../chatgpt-auth";

export type Actor = typeof users.$inferSelect;

export async function requireActor(): Promise<Actor> {
  const identity = await getChatGPTUser();
  if (!identity) throw new Error("Debes iniciar sesión para continuar.");

  const db = getDb();
  const [actor] = await db.select().from(users).where(eq(users.externalId, identity.userId)).limit(1);
  if (!actor || !actor.active) throw new Error("Tu cuenta THOR aún no está habilitada.");
  return actor;
}

export function requireRole(actor: Actor, roles: Actor["role"][]) {
  if (!roles.includes(actor.role)) throw new Error("No tienes permisos para esta operación.");
}
