import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { expenses, inventoryItems, products, sales, stockBalances } from "../../../db/schema";
import { requireActor } from "../_lib/actor";

export async function GET() {
  try {
    const actor = await requireActor();
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const location = actor.locationId;
    const [salesToday] = await db.select({ total: sql<number>`coalesce(sum(${sales.total}), 0)` }).from(sales).where(and(eq(sales.locationId, location!), eq(sales.status, "completed"), sql`${sales.createdAt} >= ${today}`));
    const [expensesToday] = await db.select({ total: sql<number>`coalesce(sum(${expenses.amount}), 0)` }).from(expenses).where(sql`${expenses.createdAt} >= ${today}`);
    const [stockValue] = await db.select({ total: sql<number>`coalesce(sum(${stockBalances.quantity} * ${stockBalances.averageCost}), 0)` }).from(stockBalances).where(eq(stockBalances.locationId, location!));
    const [items] = await db.select({ total: sql<number>`count(*)` }).from(inventoryItems).innerJoin(products, eq(inventoryItems.productId, products.id)).where(and(eq(inventoryItems.locationId, location!), eq(inventoryItems.status, "available")));
    return Response.json({ actor: { id: actor.id, name: actor.name, role: actor.role, locationId: actor.locationId }, metrics: { salesToday: salesToday.total, expensesToday: expensesToday.total, stockValue: stockValue.total, availableItems: items.total } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo obtener el panel." }, { status: 401 });
  }
}
