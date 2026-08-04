"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Login, SetupNeeded } from "./login";
import { getSupabaseBrowser } from "./lib/supabase-browser";

type Section = "inicio" | "inventario" | "ventas" | "caja";
type StockItem = { id: string; productId: string; name: string; detail: string; price: number; qty: number; kind: "Equipo" | "Accesorio" };
type Metrics = { sales: number; expenses: number; value: number; count: number };
const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("inicio");
  const [notice, setNotice] = useState("Conecta tu cuenta de THOR para comenzar.");
  const [stock, setStock] = useState<StockItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ sales: 0, expenses: 0, value: 0, count: 0 });
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<StockItem[]>([]);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [actor, setActor] = useState<{ id: string; name: string; role: string; locationId: string } | null>(null);
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setToken(session?.access_token ?? null));
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const refresh = async () => {
    if (!supabase || !token) return;
    const { data: authData } = await supabase.auth.getUser(token);
    if (!authData.user) return;
    let user = await supabase.from("app_users").select("id, name, role, location_id").eq("auth_user_id", authData.user.id).maybeSingle();
    if (!user.data && !user.error) {
      const username = (authData.user.email?.split("@")[0] ?? "admin").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 36) || "admin";
      const boot = await supabase.rpc("bootstrap_thor_admin", { p_name: authData.user.email ?? "Administrador", p_username: username });
      if (boot.error) throw boot.error;
      user = await supabase.from("app_users").select("id, name, role, location_id").eq("auth_user_id", authData.user.id).single();
    }
    if (user.error || !user.data || !user.data.location_id) throw user.error ?? new Error("Tu usuario aún no tiene una sede asignada.");
    const current = { id: user.data.id, name: user.data.name, role: user.data.role, locationId: user.data.location_id };
    setActor(current);
    const [serials, accessories, prices, sales, expenses] = await Promise.all([
      supabase.from("inventory_items").select("id, code, product_id, imei_1, serial, products!inner(name)").eq("location_id", current.locationId).eq("status", "available"),
      supabase.from("stock_balances").select("product_id, quantity, average_cost, products!inner(name, sku)").eq("location_id", current.locationId),
      supabase.from("product_prices").select("product_id, price").eq("location_id", current.locationId).eq("active", true),
      supabase.from("sales").select("total").eq("location_id", current.locationId).eq("status", "completed").gte("created_at", new Date().toISOString().slice(0, 10)),
      supabase.from("expenses").select("amount").eq("location_id", current.locationId).gte("expense_date", new Date().toISOString().slice(0, 10)),
    ]);
    for (const result of [serials, accessories, prices, sales, expenses]) if (result.error) throw result.error;
    const priceMap = new Map((prices.data ?? []).map((p) => [p.product_id, Number(p.price)]));
    const rows: StockItem[] = [
      ...(serials.data ?? []).map((item) => ({ id: item.code, productId: item.product_id, name: (item.products as unknown as { name: string }).name, detail: item.imei_1 ? `IMEI terminado en ${item.imei_1.slice(-4)}` : item.serial ? `Serie ${item.serial}` : "Equipo", price: priceMap.get(item.product_id) ?? 0, qty: 1, kind: "Equipo" as const })),
      ...(accessories.data ?? []).map((item) => ({ id: (item.products as unknown as { sku: string }).sku, productId: item.product_id, name: (item.products as unknown as { name: string }).name, detail: `SKU ${(item.products as unknown as { sku: string }).sku}`, price: priceMap.get(item.product_id) ?? 0, qty: item.quantity, kind: "Accesorio" as const })),
    ];
    setStock(rows);
    setMetrics({ sales: (sales.data ?? []).reduce((sum, item) => sum + Number(item.total), 0), expenses: (expenses.data ?? []).reduce((sum, item) => sum + Number(item.amount), 0), value: (accessories.data ?? []).reduce((sum, item) => sum + Number(item.quantity) * Number(item.average_cost), 0), count: rows.reduce((sum, item) => sum + item.qty, 0) });
    setNotice("THOR conectado a Supabase. Almacén Central listo.");
  };

  useEffect(() => { void refresh().catch((error) => setNotice(error instanceof Error ? error.message : "Ejecuta la migración de acceso para GitHub Pages.")); }, [token]);

  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !actor) return;
    const form = new FormData(event.currentTarget);
    const photo = form.get("photo");
    if (!(photo instanceof File) || !photo.size) return setNotice("La foto del equipo es obligatoria.");
    try {
      const category = String(form.get("category"));
      const sku = String(form.get("sku")).trim();
      const name = String(form.get("name")).trim();
      const imei = String(form.get("identifier")).trim();
      const cost = Number(form.get("cost") || 0);
      const price = Number(form.get("price") || 0);
      const key = `uploads/${actor.id}/${crypto.randomUUID()}.${photo.type.split("/")[1] || "jpg"}`;
      const upload = await supabase.storage.from("thor-files").upload(key, photo, { contentType: photo.type });
      if (upload.error) throw upload.error;
      let product = await supabase.from("products").select("id").eq("sku", sku).maybeSingle();
      if (product.error) throw product.error;
      if (!product.data) product = await supabase.from("products").insert({ sku, name, category, serialised: category !== "accessory", photo_path: key, active: true }).select("id").single();
      if (product.error || !product.data) throw product.error ?? new Error("No se pudo crear el producto.");
      const code = `${category === "phone" ? "CEL" : category === "laptop" ? "LAP" : "TAB"}-${Date.now().toString().slice(-7)}`;
      const item = await supabase.from("inventory_items").insert({ code, product_id: product.data.id, location_id: actor.locationId, imei_1: imei, cost, status: "available", photo_path: key }).select("id").single();
      if (item.error) throw item.error;
      await supabase.from("product_prices").update({ active: false }).eq("product_id", product.data.id).eq("location_id", actor.locationId).eq("active", true);
      const priceSave = await supabase.from("product_prices").insert({ product_id: product.data.id, location_id: actor.locationId, price, changed_by: actor.id, active: true });
      if (priceSave.error) throw priceSave.error;
      setRegisterOpen(false);
      await refresh();
      setNotice(`Equipo ${name} registrado correctamente.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo registrar el equipo."); }
  };

  const items = useMemo(() => stock.filter((item) => `${item.id} ${item.name} ${item.detail}`.toLowerCase().includes(query.toLowerCase())), [stock, query]);
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  if (!supabase) return <SetupNeeded />;
  if (!token) return <Login onAuthenticated={() => setNotice("Sesión iniciada. Conectando THOR…")} />;
  return <main className="thor-app"><aside className="side-nav"><div className="brand"><span className="bolt">ϟ</span><span>THOR</span></div><p className="location-label">SEDE ACTIVA</p><button className="location">Almacén Central</button><nav>{(["inicio", "inventario", "ventas", "caja"] as Section[]).map((name) => <button key={name} className={`nav-item ${section === name ? "active" : ""}`} onClick={() => setSection(name)}>{name === "inicio" ? "⌂" : name === "inventario" ? "▦" : name === "ventas" ? "▱" : "◫"} {name[0].toUpperCase() + name.slice(1)}</button>)}</nav><div className="profile"><span className="avatar">{actor?.name.slice(0, 2).toUpperCase() ?? "TH"}</span><div><strong>{actor?.name ?? "THOR"}</strong><small>{actor?.role ?? "Cargando"}</small></div></div></aside><section className="workspace"><header className="topbar"><div><p className="eyebrow">THOR · PERÚ</p><h1>{section === "inicio" ? "Todo bajo control" : section[0].toUpperCase() + section.slice(1)}</h1></div><button className="quick" onClick={() => setSection("ventas")}>＋ Nueva venta</button></header><div className="notice" role="status"><span>✓</span>{notice}</div>{section === "inicio" && <div className="content"><div className="metrics"><Metric label="Ventas del día" value={money.format(metrics.sales)} note="Ventas confirmadas"/><Metric label="Gastos del día" value={money.format(metrics.expenses)} note="Egresos registrados"/><Metric label="Inventario valorizado" value={money.format(metrics.value)} note={`${metrics.count} unidades disponibles`}/></div><section className="card"><h2>Base real conectada</h2><p>Inventario, usuarios y fotos se guardan directamente en Supabase. Este enlace se actualiza desde GitHub Pages.</p></section></div>}{section === "inventario" && <div className="content"><div className="page-actions"><label className="search">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, IMEI o código"/></label><button className="primary" onClick={() => setRegisterOpen(true)}>＋ Registrar equipo</button></div><section className="card table-card">{items.length ? items.map((item) => <article className="inventory-row" key={item.id}><div className="product-image">{item.kind === "Equipo" ? "▣" : "⌁"}</div><div className="product"><strong>{item.name}</strong><small>{item.id} · {item.detail}</small></div><span className="badge success">Disponible</span><div className="price"><strong>{money.format(item.price)}</strong><small>{item.qty} unidades</small></div><button className="row-action" onClick={() => setCart((current) => [...current, item])}>Vender</button></article>) : <p className="empty">Aún no hay inventario. Registra el primer equipo.</p>}</section></div>}{section === "ventas" && <div className="sale-layout"><section className="catalog"><label className="search">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto"/></label><div className="sale-products">{items.map((item) => <button className="sale-product" key={item.id} onClick={() => setCart((current) => [...current, item])}><strong>{item.name}</strong><small>{money.format(item.price)} · {item.qty} disp.</small></button>)}</div></section><aside className="cart"><p className="eyebrow">VENTA NUEVA</p><h2>Borrador</h2>{cart.map((item, index) => <div className="cart-lines" key={`${item.id}-${index}`}><span>{item.name}</span><b>{money.format(item.price)}</b><button onClick={() => setCart((items) => items.filter((_, i) => i !== index))}>×</button></div>)}<div className="total"><span>Total</span><strong>{money.format(total)}</strong></div><button className="primary sale-button" disabled={!cart.length} onClick={() => { setCart([]); setNotice("Venta preparada. La confirmación con pago y firma se habilita en el siguiente módulo."); }}>Preparar venta</button></aside></div>}{section === "caja" && <div className="content"><section className="card"><p className="eyebrow">CAJA DE ALMACÉN CENTRAL</p><h2>Resumen diario</h2><div className="metrics"><Metric label="Ventas" value={money.format(metrics.sales)} note="Hoy"/><Metric label="Gastos" value={money.format(metrics.expenses)} note="Hoy"/></div></section></div>}</section>{registerOpen && <div className="modal-backdrop"><form className="modal" onSubmit={register}><button type="button" className="close" onClick={() => setRegisterOpen(false)}>×</button><p className="eyebrow">ENTRADA DE INVENTARIO</p><h2>Registrar equipo</h2><label>Marca y modelo<input name="name" required autoFocus placeholder="Ej. Samsung Galaxy A56"/></label><label>Tipo<select name="category" defaultValue="phone"><option value="phone">Celular</option><option value="laptop">Laptop</option><option value="tablet">Tablet</option></select></label><label>SKU interno<input name="sku" required placeholder="Ej. SAM-A56-256"/></label><label>IMEI, serial o código<input name="identifier" required/></label><div className="two-fields"><label>Costo (S/)<input name="cost" type="number" min="0" step="0.01" required/></label><label>Precio (S/)<input name="price" type="number" min="0" step="0.01" required/></label></div><label>Foto del equipo<input name="photo" required type="file" accept="image/*" capture="environment"/></label><button className="primary" type="submit">Guardar equipo</button></form></div>}</main>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <section className="metric"><p>{label}</p><strong>{value}</strong><small>{note}</small></section>; }
