"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Login, SetupNeeded } from "./login";
import { getSupabaseBrowser } from "./lib/supabase-browser";

type Section = "inicio" | "inventario" | "ventas" | "transferencias" | "caja";
type StockItem = { id: string; name: string; detail: string; price: number; qty: number; kind: "Equipo" | "Accesorio" };
type DashboardMetrics = { salesToday: number; expensesToday: number; stockValue: number; availableItems: number };

const initialStock: StockItem[] = [
  { id: "CEL-000128", name: "Samsung Galaxy A56 5G", detail: "256 GB · IMEI terminado en 8492", price: 1299, qty: 1, kind: "Equipo" },
  { id: "CEL-000127", name: "iPhone 15", detail: "128 GB · IMEI terminado en 7610", price: 2899, qty: 1, kind: "Equipo" },
  { id: "ACC-000031", name: "Cargador Samsung 25 W", detail: "SKU SAM-25W · código de barras", price: 69, qty: 12, kind: "Accesorio" },
  { id: "ACC-000045", name: "Cable USB-C a USB-C", detail: "SKU CBL-C-C-1M", price: 29, qty: 18, kind: "Accesorio" },
];
const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

export default function Home() {
  const [section, setSection] = useState<Section>("inicio");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<StockItem[]>([]);
  const [notice, setNotice] = useState("Operación segura: toda venta se valida al confirmar.");
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [stock, setStock] = useState<StockItem[]>(initialStock);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [newItem, setNewItem] = useState("");
  const items = useMemo(() => stock.filter((item) => `${item.id} ${item.name} ${item.detail}`.toLowerCase().includes(query.toLowerCase())), [query, stock]);
  const total = cart.reduce((sum, item) => sum + item.price, 0);
  const add = (item: StockItem) => {
    if (item.qty === 1 && cart.some((entry) => entry.id === item.id)) return;
    setCart((current) => [...current, item]);
    setNotice(`${item.name} se agregó a la venta.`);
  };
  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setAccessToken(session?.access_token ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    async function connect() {
      if (!accessToken) return;
      try {
        const headers = { authorization: `Bearer ${accessToken}` };
        const setup = await fetch("/api/setup", { headers });
        const initial = await setup.json() as { initialized?: boolean; error?: string };
        if (!setup.ok) throw new Error(initial.error);
        if (!initial.initialized) {
          const created = await fetch("/api/setup", { method: "POST", headers });
          const payload = await created.json() as { error?: string };
          if (!created.ok) throw new Error(payload.error);
        }
        const dashboard = await fetch("/api/dashboard", { headers });
        const payload = await dashboard.json() as { metrics?: DashboardMetrics; error?: string };
        if (!dashboard.ok) throw new Error(payload.error);
        setMetrics(payload.metrics ?? null);
        const inventory = await fetch("/api/inventory", { headers });
        const inventoryPayload = await inventory.json() as { serialized?: Array<{ code: string; name: string; imei1?: string | null; serial?: string | null; price: number }>; accessories?: Array<{ productId: string; sku: string; name: string; quantity: number; price: number }>; error?: string };
        if (!inventory.ok) throw new Error(inventoryPayload.error);
        setStock([
          ...(inventoryPayload.serialized ?? []).map((item) => ({ id: item.code, name: item.name, detail: item.imei1 ? `IMEI terminado en ${item.imei1.slice(-4)}` : item.serial ? `Serie ${item.serial}` : "Equipo serializado", price: item.price, qty: 1, kind: "Equipo" as const })),
          ...(inventoryPayload.accessories ?? []).map((item) => ({ id: item.sku, name: item.name, detail: `SKU ${item.sku}`, price: item.price, qty: item.quantity, kind: "Accesorio" as const })),
        ]);
        setNotice("Base de datos THOR conectada. Almacén Central listo para operar.");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "No se pudo conectar la base de datos todavía.");
      }
    }
    void connect();
  }, [accessToken]);
  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const photo = form.get("photo");
    if (!(photo instanceof File) || !photo.size) return setNotice("Debes adjuntar una foto del equipo.");
    try {
      setNotice("Subiendo foto y registrando equipo…");
      const uploadData = new FormData(); uploadData.set("file", photo);
      if (!accessToken) throw new Error("Inicia sesión para registrar inventario.");
      const upload = await fetch("/api/uploads", { method: "POST", headers: { authorization: `Bearer ${accessToken}` }, body: uploadData });
      const uploaded = await upload.json() as { key?: string; error?: string };
      if (!upload.ok || !uploaded.key) throw new Error(uploaded.error);
      const saved = await fetch("/api/inventory", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ name: newItem, sku: form.get("sku"), category: form.get("category"), imei1: form.get("identifier"), photoKey: uploaded.key, cost: Number(form.get("cost") || 0), price: Number(form.get("price") || 0) }) });
      const result = await saved.json() as { error?: string };
      if (!saved.ok) throw new Error(result.error);
      setRegisterOpen(false); setNewItem(""); setNotice(`Equipo ${newItem} registrado correctamente en Almacén Central.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo registrar el equipo."); }
  };

  const supabase = getSupabaseBrowser();
  if (!supabase) return <SetupNeeded />;
  if (!accessToken) return <Login onAuthenticated={() => setNotice("Sesión iniciada. Conectando THOR…")} />;
  return <main className="thor-app">
    <aside className="side-nav"><div className="brand"><span className="bolt">ϟ</span><span>THOR</span></div><p className="location-label">SEDE ACTIVA</p><button className="location">Almacén Central <span>⌄</span></button><nav><Nav icon="⌂" label="Inicio" active={section === "inicio"} onClick={() => setSection("inicio")} /><Nav icon="▦" label="Inventario" active={section === "inventario"} onClick={() => setSection("inventario")} /><Nav icon="▱" label="Ventas" active={section === "ventas"} onClick={() => setSection("ventas")} /><Nav icon="↔" label="Transferencias" active={section === "transferencias"} onClick={() => setSection("transferencias")} /><Nav icon="◫" label="Caja" active={section === "caja"} onClick={() => setSection("caja")} /></nav><div className="profile"><span className="avatar">AM</span><div><strong>Administrador</strong><small>Almacén Central</small></div></div></aside>
    <section className="workspace"><header className="topbar"><div><p className="eyebrow">LUNES, 3 DE AGOSTO</p><h1>{titles[section]}</h1></div><div className="top-actions"><button className="icon-button" aria-label="Notificaciones">♧<i /></button><button className="quick" onClick={() => setSection("ventas")}>＋ Nueva venta</button></div></header><div className="notice" role="status"><span>✓</span>{notice}</div>
      {section === "inicio" && <Dashboard go={setSection} metrics={metrics} />}
      {section === "inventario" && <Inventory items={items} query={query} setQuery={setQuery} add={add} onRegister={() => setRegisterOpen(true)} />}
      {section === "ventas" && <Sales items={items} query={query} setQuery={setQuery} cart={cart} add={add} total={total} remove={(index) => setCart(cart.filter((_, itemIndex) => itemIndex !== index))} confirm={() => { setCart([]); setNotice("Venta validada. El comprobante está listo para compartir por WhatsApp."); }} />}
      {section === "transferencias" && <Transfers />}{section === "caja" && <Cash />}
    </section>
    <nav className="mobile-nav"><Nav icon="⌂" label="Inicio" active={section === "inicio"} onClick={() => setSection("inicio")} /><Nav icon="▦" label="Stock" active={section === "inventario"} onClick={() => setSection("inventario")} /><Nav icon="＋" label="Vender" active={section === "ventas"} onClick={() => setSection("ventas")} /><Nav icon="◫" label="Caja" active={section === "caja"} onClick={() => setSection("caja")} /></nav>
    {registerOpen && <div className="modal-backdrop"><form className="modal" onSubmit={register}><button type="button" className="close" onClick={() => setRegisterOpen(false)}>×</button><p className="eyebrow">ENTRADA DE INVENTARIO</p><h2>Registrar equipo</h2><p>Escanea con la cámara el IMEI o código. La foto es obligatoria.</p><label>Marca y modelo<input required autoFocus value={newItem} onChange={(event) => setNewItem(event.target.value)} placeholder="Ej. Samsung Galaxy A56" /></label><label>Tipo<select name="category" defaultValue="phone"><option value="phone">Celular</option><option value="laptop">Laptop</option><option value="tablet">Tablet</option></select></label><label>SKU interno<input name="sku" required placeholder="Ej. SAM-A56-256" /></label><label>IMEI, serial o código<input name="identifier" required placeholder="Escanear o escribir" /></label><div className="two-fields"><label>Costo (S/)<input name="cost" type="number" min="0" step="0.01" required /></label><label>Precio (S/)<input name="price" type="number" min="0" step="0.01" required /></label></div><label>Foto del equipo<input name="photo" required type="file" accept="image/*" capture="environment" /></label><button className="primary" type="submit">Guardar equipo</button></form></div>}
  </main>;
}

const titles: Record<Section, string> = { inicio: "Buenos días, THOR", inventario: "Inventario", ventas: "Nueva venta", transferencias: "Transferencias", caja: "Caja diaria" };
function Nav({ icon, label, active, onClick }: { icon: string; label: string; active: boolean; onClick: () => void }) { return <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}><span>{icon}</span>{label}</button>; }
function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <section className="metric"><p>{label}</p><strong>{value}</strong><small>{note}</small></section>; }
function Movement({ icon, color, title, note, value }: { icon: string; color: string; title: string; note: string; value: string }) { return <div className="movement"><span className={`movement-icon ${color}`}>{icon}</span><div><strong>{title}</strong><small>{note}</small></div><b>{value}</b></div>; }

function Dashboard({ go, metrics }: { go: (section: Section) => void; metrics: DashboardMetrics | null }) { return <div className="content"><div className="hero"><div><p className="eyebrow">RESUMEN DE HOY</p><h2>Todo bajo control.</h2><p>Revisa tus ventas, caja e inventario en un solo lugar.</p></div><button className="primary" onClick={() => go("ventas")}>＋ Registrar venta</button></div><div className="metrics"><Metric label="Ventas del día" value={metrics ? money.format(metrics.salesToday) : "—"} note="Ventas confirmadas" /><Metric label="Utilidad estimada" value="—" note="Se calcula al ingresar costos" /><Metric label="Gastos del día" value={metrics ? money.format(metrics.expensesToday) : "—"} note="Gastos registrados" /><Metric label="Inventario valorizado" value={metrics ? money.format(metrics.stockValue) : "—"} note={metrics ? `${metrics.availableItems} registros disponibles` : "Conectando inventario"} /></div><div className="split"><section className="card"><div className="card-head"><div><p className="eyebrow">ACTIVIDAD</p><h3>Últimos movimientos</h3></div><button className="text-button">Ver todo</button></div><Movement icon="↑" color="gold" title="Venta V-AC-000021" note="La actividad real aparecerá aquí" value="Pendiente" /><Movement icon="↔" color="blue" title="Transferencias" note="Flujo con aprobación de administrador" value="Listo" /><Movement icon="↓" color="green" title="Lotes de proveedor" note="Se registran y aprueban antes de aumentar stock" value="Listo" /></section><section className="card"><div className="card-head"><div><p className="eyebrow">ATENCIÓN</p><h3>Stock por reponer</h3></div><span className="badge warning">Próximamente</span></div><Alert name="Alertas por mínimo" qty="Se activan al registrar productos" /><Alert name="Inventario físico" qty="Escaneo QR disponible en la siguiente operación" /></section></div></div>; }
function Alert({ name, qty }: { name: string; qty: string }) { return <div className="alert-row"><span>!</span><div><strong>{name}</strong><small>{qty}</small></div><button>Reponer</button></div>; }

function Inventory({ items, query, setQuery, add, onRegister }: { items: StockItem[]; query: string; setQuery: (value: string) => void; add: (item: StockItem) => void; onRegister: () => void }) { return <div className="content"><div className="page-actions"><Search query={query} setQuery={setQuery} placeholder="Buscar por nombre, IMEI, serial o código" /><button className="primary" onClick={onRegister}>＋ Registrar equipo</button></div><section className="card table-card"><div className="filters"><button className="filter selected">Todos <b>34</b></button><button className="filter">Equipos</button><button className="filter">Accesorios</button><button className="filter">Bajo stock</button></div>{items.map((item) => <article className="inventory-row" key={item.id}><div className="product-image">{item.kind === "Equipo" ? "▣" : "⌁"}</div><div className="product"><strong>{item.name}</strong><small>{item.id} · {item.detail}</small></div><span className="badge success">Disponible</span><div className="price"><strong>{money.format(item.price)}</strong><small>{item.qty} {item.qty === 1 ? "unidad" : "unidades"}</small></div><button className="row-action" onClick={() => add(item)}>Agregar a venta</button></article>)}</section></div>; }
function Search({ query, setQuery, placeholder }: { query: string; setQuery: (value: string) => void; placeholder: string }) { return <label className="search">⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} /></label>; }

function Sales({ items, query, setQuery, cart, add, total, remove, confirm }: { items: StockItem[]; query: string; setQuery: (value: string) => void; cart: StockItem[]; add: (item: StockItem) => void; total: number; remove: (index: number) => void; confirm: () => void }) { const [customer, setCustomer] = useState("Cliente General"); return <div className="sale-layout"><section className="catalog"><div className="page-actions"><Search query={query} setQuery={setQuery} placeholder="Escanea o busca producto" /></div><p className="eyebrow">DISPONIBLE EN ALMACÉN CENTRAL</p><div className="sale-products">{items.map((item) => <button key={item.id} className="sale-product" onClick={() => add(item)}><span>{item.kind === "Equipo" ? "▣" : "⌁"}</span><strong>{item.name}</strong><small>{money.format(item.price)} · {item.qty} disp.</small></button>)}</div></section><aside className="cart"><div className="card-head"><div><p className="eyebrow">VENTA NUEVA</p><h2>V-AC-000022</h2></div><span className="badge neutral">Borrador</span></div><label className="customer">Cliente<input value={customer} onChange={(event) => setCustomer(event.target.value)} /></label><div className="cart-lines">{cart.length === 0 ? <p className="empty">Agrega productos para iniciar la venta.</p> : cart.map((item, index) => <div key={`${item.id}-${index}`}><span>{item.name}</span><b>{money.format(item.price)}</b><button aria-label={`Quitar ${item.name}`} onClick={() => remove(index)}>×</button></div>)}</div><div className="total"><span>Total</span><strong>{money.format(total)}</strong></div><button className="primary sale-button" disabled={!cart.length} onClick={confirm}>Confirmar venta</button><small className="sale-note">Acepta efectivo, Yape/Plin, transferencia, tarjeta y pagos combinados.</small></aside></div>; }
function Transfers() { return <div className="content"><div className="hero compact"><div><p className="eyebrow">MOVIMIENTO ENTRE SEDES</p><h2>Transferencias</h2><p>El destino recibe el pedido completo o registra una incidencia.</p></div><button className="primary">＋ Nueva transferencia</button></div><section className="card transfer-list"><Transfer code="T-000014" detail="Almacén Central → Tienda San Miguel" qty="8 productos" status="Pendiente de aprobación" /><Transfer code="T-000013" detail="Almacén Central → Tienda San Miguel" qty="4 productos" status="En tránsito" /></section></div>; }
function Transfer({ code, detail, qty, status }: { code: string; detail: string; qty: string; status: string }) { return <article><span className="transfer-icon">↔</span><div><strong>{code}</strong><small>{detail}</small></div><span>{qty}</span><b className={status === "En tránsito" ? "status-blue" : "status-gold"}>{status}</b><button className="text-button">Ver detalle</button></article>; }
function Cash() { return <div className="content"><div className="cash-banner"><div><p className="eyebrow">CAJA ACTUAL</p><h2>Almacén Central · Abierta</h2><p>Abierta por Administrador a las 08:15</p></div><button className="secondary">Registrar gasto</button><button className="primary">Cerrar caja</button></div><div className="metrics"><Metric label="Efectivo esperado" value="S/ 1,246.00" note="Incluye apertura" /><Metric label="Yape / Plin" value="S/ 1,890.00" note="4 pagos" /><Metric label="Tarjeta" value="S/ 1,150.00" note="2 pagos" /><Metric label="Egresos" value="S/ 86.50" note="3 gastos" /></div><section className="card expense-card"><div className="card-head"><div><p className="eyebrow">EGRESOS DE HOY</p><h3>Gastos registrados</h3></div><button className="text-button">Ver gastos</button></div><Movement icon="−" color="red" title="Transporte" note="Administrador · Efectivo" value="S/ 24.00" /><Movement icon="−" color="red" title="Compra menor" note="Administrador · Yape" value="S/ 62.50" /></section></div>; }
