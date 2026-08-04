import { getSupabaseAdmin } from "../../../db/supabase";
import { requireActor } from "../_lib/auth";

type Payload = { name?: string; brand?: string; category?: "phone" | "laptop" | "tablet" | "accessory"; sku?: string; barcode?: string; imei1?: string; imei2?: string; serial?: string; quantity?: number; cost?: number; price?: number; photoKey?: string };

export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!actor.locationId) throw new Error("Tu cuenta no tiene una sede asignada.");
    const db = getSupabaseAdmin();
    const [serialized, accessories, prices] = await Promise.all([
      db.from("inventory_items").select("id, code, product_id, imei_1, serial, status, photo_path, products!inner(name, category)").eq("location_id", actor.locationId).order("created_at", { ascending: false }),
      db.from("stock_balances").select("product_id, quantity, average_cost, products!inner(name, sku, photo_path)").eq("location_id", actor.locationId),
      db.from("product_prices").select("product_id, price").eq("location_id", actor.locationId).eq("active", true),
    ]);
    for (const result of [serialized, accessories, prices]) if (result.error) throw result.error;
    const priceByProduct = new Map((prices.data ?? []).map((price) => [price.product_id, Number(price.price)]));
    return Response.json({
      serialized: (serialized.data ?? []).map((item) => ({ id: item.id, code: item.code, productId: item.product_id, name: (item.products as unknown as { name: string }).name, category: (item.products as unknown as { category: string }).category, imei1: item.imei_1, serial: item.serial, status: item.status, photoKey: item.photo_path, price: priceByProduct.get(item.product_id) ?? 0 })),
      accessories: (accessories.data ?? []).map((item) => ({ productId: item.product_id, name: (item.products as unknown as { name: string }).name, sku: (item.products as unknown as { sku: string }).sku, quantity: item.quantity, averageCost: Number(item.average_cost), photoKey: (item.products as unknown as { photo_path: string | null }).photo_path, price: priceByProduct.get(item.product_id) ?? 0 })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo consultar inventario." }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!actor.locationId) throw new Error("Tu cuenta no tiene una sede asignada.");
    const data = (await request.json()) as Payload;
    const name = data.name?.trim();
    const category = data.category;
    const sku = data.sku?.trim();
    const photoPath = data.photoKey?.trim();
    if (!name || !category || !sku || !photoPath) return Response.json({ error: "Nombre, categoría, SKU y foto son obligatorios." }, { status: 400 });
    const serialised = category !== "accessory";
    if (serialised && !(data.imei1?.trim() || data.serial?.trim())) return Response.json({ error: "Registra IMEI o número de serie para el equipo." }, { status: 400 });
    if (!serialised && (!Number.isInteger(data.quantity) || (data.quantity ?? 0) < 1)) return Response.json({ error: "Indica una cantidad válida para el accesorio." }, { status: 400 });

    const db = getSupabaseAdmin();
    const { data: existingProduct, error: findError } = await db.from("products").select("id").eq("sku", sku).maybeSingle();
    if (findError) throw findError;
    let productId = existingProduct?.id;
    const cost = Math.max(0, Number(data.cost ?? 0));
    const price = Math.max(0, Number(data.price ?? 0));
    if (!productId) {
      const created = await db.from("products").insert({ sku, barcode: data.barcode?.trim() || null, name, brand: data.brand?.trim() || null, category, serialised, photo_path: photoPath, active: true }).select("id").single();
      if (created.error || !created.data) throw created.error ?? new Error("No se pudo crear el producto.");
      productId = created.data.id;
    }

    const prefix = category === "phone" ? "CEL" : category === "laptop" ? "LAP" : category === "tablet" ? "TAB" : "ACC";
    const referenceCode = `${prefix}-${Date.now().toString().slice(-7)}`;
    if (serialised) {
      const created = await db.from("inventory_items").insert({ code: referenceCode, product_id: productId, location_id: actor.locationId, imei_1: data.imei1?.trim() || null, imei_2: data.imei2?.trim() || null, serial: data.serial?.trim() || null, cost, status: "available", photo_path: photoPath }).select("id").single();
      if (created.error || !created.data) throw created.error ?? new Error("No se pudo registrar el equipo.");
      const movement = await db.from("stock_movements").insert({ product_id: productId, inventory_item_id: created.data.id, to_location_id: actor.locationId, quantity: 1, type: "receipt", reference_code: referenceCode, performed_by: actor.id, note: "Registro directo pendiente de lote/proveedor" });
      if (movement.error) throw movement.error;
      await db.from("audit_log").insert({ actor_id: actor.id, action: "inventory.register", entity_type: "inventory_item", entity_id: created.data.id, detail: { code: referenceCode } });
    } else {
      const quantity = data.quantity ?? 0;
      const balance = await db.from("stock_balances").select("id, quantity, average_cost").eq("product_id", productId).eq("location_id", actor.locationId).maybeSingle();
      if (balance.error) throw balance.error;
      const priorQuantity = balance.data?.quantity ?? 0;
      const totalQuantity = priorQuantity + quantity;
      const averageCost = totalQuantity ? ((Number(balance.data?.average_cost ?? 0) * priorQuantity) + cost * quantity) / totalQuantity : 0;
      const saved = balance.data
        ? await db.from("stock_balances").update({ quantity: totalQuantity, average_cost: averageCost }).eq("id", balance.data.id)
        : await db.from("stock_balances").insert({ product_id: productId, location_id: actor.locationId, quantity, average_cost: cost });
      if (saved.error) throw saved.error;
      const movement = await db.from("stock_movements").insert({ product_id: productId, to_location_id: actor.locationId, quantity, type: "receipt", reference_code: referenceCode, performed_by: actor.id, note: "Registro directo de accesorio" });
      if (movement.error) throw movement.error;
    }
    if (price > 0) {
      const deactivate = await db.from("product_prices").update({ active: false }).eq("product_id", productId).eq("location_id", actor.locationId).eq("active", true);
      if (deactivate.error) throw deactivate.error;
      const createdPrice = await db.from("product_prices").insert({ product_id: productId, location_id: actor.locationId, price, changed_by: actor.id, active: true });
      if (createdPrice.error) throw createdPrice.error;
    }
    return Response.json({ productId, message: serialised ? "Equipo registrado." : "Accesorio registrado." }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo registrar el producto.";
    const duplicate = /duplicate|unique/i.test(message);
    return Response.json({ error: duplicate ? "El SKU, código o IMEI ya existe en THOR." : message }, { status: 400 });
  }
}
