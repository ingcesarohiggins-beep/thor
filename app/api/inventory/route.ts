import { eq, sql } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditLog, inventoryItems, productPrices, products, stockBalances, stockMovements } from "../../../db/schema";
import { requireActor } from "../_lib/actor";

type Payload = { name?: string; brand?: string; category?: "phone" | "laptop" | "tablet" | "accessory"; sku?: string; barcode?: string; imei1?: string; imei2?: string; serial?: string; quantity?: number; cost?: number; price?: number; photoKey?: string };
const now = () => new Date().toISOString();

export async function GET() {
  try {
    const actor = await requireActor();
    const db = getDb();
    const serialized = await db.select({ id: inventoryItems.id, code: inventoryItems.code, name: products.name, category: products.category, imei1: inventoryItems.imei1, serial: inventoryItems.serial, status: inventoryItems.status, photoKey: inventoryItems.photoKey }).from(inventoryItems).innerJoin(products, eq(inventoryItems.productId, products.id)).where(eq(inventoryItems.locationId, actor.locationId!));
    const accessories = await db.select({ productId: products.id, name: products.name, sku: products.sku, quantity: stockBalances.quantity, averageCost: stockBalances.averageCost, photoKey: products.photoKey }).from(stockBalances).innerJoin(products, eq(stockBalances.productId, products.id)).where(eq(stockBalances.locationId, actor.locationId!));
    return Response.json({ serialized, accessories });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar inventario." }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor();
    if (!actor.locationId) throw new Error("Tu cuenta no tiene una sede asignada.");
    const data = (await request.json()) as Payload;
    const name = data.name?.trim();
    const category = data.category;
    const sku = data.sku?.trim();
    const photoKey = data.photoKey?.trim();
    if (!name || !category || !sku || !photoKey) return Response.json({ error: "Nombre, categoría, SKU y foto son obligatorios." }, { status: 400 });
    const serialized = category !== "accessory";
    if (serialized && !(data.imei1?.trim() || data.serial?.trim())) return Response.json({ error: "Registra IMEI o número de serie para el equipo." }, { status: 400 });
    if (!serialized && (!Number.isInteger(data.quantity) || (data.quantity ?? 0) < 1)) return Response.json({ error: "Indica una cantidad válida para el accesorio." }, { status: 400 });

    const db = getDb();
    const timestamp = now();
    const [existingProduct] = await db.select().from(products).where(eq(products.sku, sku)).limit(1);
    const productId = existingProduct?.id ?? crypto.randomUUID();
    const cost = Math.max(0, Number(data.cost ?? 0));
    const price = Math.max(0, Number(data.price ?? 0));
    const actions = [];
    if (!existingProduct) actions.push(db.insert(products).values({ id: productId, sku, barcode: data.barcode?.trim() || null, name, brand: data.brand?.trim() || null, category, serialised: serialized, photoKey, active: true, createdAt: timestamp, updatedAt: timestamp }));

    if (serialized) {
      const prefix = category === "phone" ? "CEL" : category === "laptop" ? "LAP" : "TAB";
      const code = `${prefix}-${Date.now().toString().slice(-7)}`;
      const itemId = crypto.randomUUID();
      actions.push(db.insert(inventoryItems).values({ id: itemId, code, productId, locationId: actor.locationId, imei1: data.imei1?.trim() || null, imei2: data.imei2?.trim() || null, serial: data.serial?.trim() || null, cost, status: "available", photoKey, createdAt: timestamp, updatedAt: timestamp }));
      actions.push(db.insert(stockMovements).values({ id: crypto.randomUUID(), productId, inventoryItemId: itemId, fromLocationId: null, toLocationId: actor.locationId, quantity: 1, type: "receipt", referenceCode: code, performedBy: actor.id, note: "Registro directo pendiente de lote/proveedor", createdAt: timestamp }));
      actions.push(db.insert(auditLog).values({ id: crypto.randomUUID(), actorId: actor.id, action: "inventory.register", entityType: "inventory_item", entityId: itemId, detail: code, createdAt: timestamp }));
    } else {
      const quantity = data.quantity ?? 0;
      actions.push(db.insert(stockBalances).values({ id: crypto.randomUUID(), productId, locationId: actor.locationId, quantity, averageCost: cost, updatedAt: timestamp }).onConflictDoUpdate({ target: [stockBalances.productId, stockBalances.locationId], set: { quantity: sql`${stockBalances.quantity} + ${quantity}`, averageCost: sql`CASE WHEN ${stockBalances.quantity} + ${quantity} > 0 THEN ((${stockBalances.averageCost} * ${stockBalances.quantity}) + (${cost} * ${quantity})) / (${stockBalances.quantity} + ${quantity}) ELSE 0 END`, updatedAt: timestamp } }));
      actions.push(db.insert(stockMovements).values({ id: crypto.randomUUID(), productId, inventoryItemId: null, fromLocationId: null, toLocationId: actor.locationId, quantity, type: "receipt", referenceCode: `ACC-${Date.now().toString().slice(-7)}`, performedBy: actor.id, note: "Registro directo de accesorio", createdAt: timestamp }));
    }
    if (price > 0) actions.push(db.insert(productPrices).values({ id: crypto.randomUUID(), productId, locationId: actor.locationId, price, changedBy: actor.id, active: true, createdAt: timestamp }));
    await db.batch(actions);
    return Response.json({ productId, message: serialized ? "Equipo registrado." : "Accesorio registrado." }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo registrar el producto.";
    const duplicate = message.includes("UNIQUE constraint failed");
    return Response.json({ error: duplicate ? "El SKU, código o IMEI ya existe en THOR." : message }, { status: 400 });
  }
}
