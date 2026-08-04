import { getSupabaseAdmin } from "../../../db/supabase";
import { requireActor } from "../_lib/auth";

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!actor.locationId) throw new Error("Tu cuenta no tiene una sede asignada.");
    const db = getSupabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);
    const [sales, expenses, balances, items] = await Promise.all([
      db.from("sales").select("total").eq("location_id", actor.locationId).eq("status", "completed").gte("created_at", today),
      db.from("expenses").select("amount").eq("location_id", actor.locationId).gte("expense_date", today),
      db.from("stock_balances").select("quantity, average_cost").eq("location_id", actor.locationId),
      db.from("inventory_items").select("id", { count: "exact", head: true }).eq("location_id", actor.locationId).eq("status", "available"),
    ]);
    for (const result of [sales, expenses, balances, items]) if (result.error) throw result.error;
    const sum = (rows: Array<Record<string, number>> | null, field: string) => (rows ?? []).reduce((total, row) => total + Number(row[field] ?? 0), 0);
    const stockValue = (balances.data ?? []).reduce((total, row) => total + Number(row.quantity) * Number(row.average_cost), 0);
    return Response.json({ actor, metrics: { salesToday: sum(sales.data as Array<Record<string, number>>, "total"), expensesToday: sum(expenses.data as Array<Record<string, number>>, "amount"), stockValue, availableItems: items.count ?? 0 } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo obtener el panel." }, { status: 401 });
  }
}
