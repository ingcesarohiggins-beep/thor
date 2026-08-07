"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Login, SetupNeeded } from "./login";
import { getSupabaseBrowser } from "./lib/supabase-browser";
import {
  calculateCartTotal,
  paymentTotal,
  paymentsMatchTotal,
} from "./lib/sale";

type Section =
  | "inicio"
  | "inventario"
  | "ventas"
  | "caja"
  | "usuarios"
  | "manuales";
type StockItem = {
  id: string;
  inventoryItemId?: string;
  productId: string;
  name: string;
  detail: string;
  price: number;
  qty: number;
  availableQty: number;
  kind: "Equipo" | "Accesorio";
};
type Metrics = {
  sales: number;
  expenses: number;
  value: number;
  count: number;
};
type UserRole = "superadmin" | "admin" | "seller";
type Payment = { method: string; amount: number | "" };
type Customer = { name: string; dni: string; phone: string; address: string };
type ManagedUser = {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  active: boolean;
  locations: { name: string }[];
};

const money = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});
const emptyCustomer: Customer = { name: "", dni: "", phone: "", address: "" };
const newPayment = (): Payment => ({ method: "Efectivo", amount: "" });

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("inicio");
  const [notice, setNotice] = useState(
    "Conecta tu cuenta de THOR para comenzar.",
  );
  const [stock, setStock] = useState<StockItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    sales: 0,
    expenses: 0,
    value: 0,
    count: 0,
  });
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<StockItem[]>([]);
  const [customer, setCustomer] = useState<Customer>(emptyCustomer);
  const [payments, setPayments] = useState<Payment[]>([newPayment()]);
  const [savingSale, setSavingSale] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [actor, setActor] = useState<{
    id: string;
    name: string;
    role: string;
    locationId: string;
  } | null>(null);
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth
      .getSession()
      .then(({ data }) => setToken(data.session?.access_token ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => setToken(session?.access_token ?? null),
    );
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const refresh = async () => {
    if (!supabase || !token) return;
    const { data: authData } = await supabase.auth.getUser(token);
    if (!authData.user) return;
    let user = await supabase
      .from("app_users")
      .select("id, name, role, location_id")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (!user.data && !user.error) {
      const username =
        (authData.user.email?.split("@")[0] ?? "admin")
          .replace(/[^a-zA-Z0-9._-]/g, "")
          .slice(0, 36) || "admin";
      const boot = await supabase.rpc("bootstrap_thor_admin", {
        p_name: authData.user.email ?? "Administrador",
        p_username: username,
      });
      if (boot.error) throw boot.error;
      user = await supabase
        .from("app_users")
        .select("id, name, role, location_id")
        .eq("auth_user_id", authData.user.id)
        .single();
    }
    if (user.error || !user.data || !user.data.location_id)
      throw (
        user.error ?? new Error("Tu usuario aún no tiene una sede asignada.")
      );
    const current = {
      id: user.data.id,
      name: user.data.name,
      role: user.data.role,
      locationId: user.data.location_id,
    };
    setActor(current);
    const [serials, accessories, prices, sales, expenses] = await Promise.all([
      supabase
        .from("inventory_items")
        .select("id, code, product_id, imei_1, serial, products!inner(name)")
        .eq("location_id", current.locationId)
        .eq("status", "available"),
      supabase
        .from("stock_balances")
        .select("product_id, quantity, average_cost, products!inner(name, sku)")
        .eq("location_id", current.locationId),
      supabase
        .from("product_prices")
        .select("product_id, price")
        .eq("location_id", current.locationId)
        .eq("active", true),
      supabase
        .from("sales")
        .select("total")
        .eq("location_id", current.locationId)
        .eq("status", "completed")
        .gte("created_at", new Date().toISOString().slice(0, 10)),
      supabase
        .from("expenses")
        .select("amount")
        .eq("location_id", current.locationId)
        .gte("expense_date", new Date().toISOString().slice(0, 10)),
    ]);
    for (const result of [serials, accessories, prices, sales, expenses])
      if (result.error) throw result.error;
    const priceMap = new Map(
      (prices.data ?? []).map((price) => [
        price.product_id,
        Number(price.price),
      ]),
    );
    const rows: StockItem[] = [
      ...(serials.data ?? []).map((item) => ({
        id: item.code,
        inventoryItemId: item.id,
        productId: item.product_id,
        name: (item.products as unknown as { name: string }).name,
        detail: item.imei_1
          ? `IMEI terminado en ${item.imei_1.slice(-4)}`
          : item.serial
            ? `Serie ${item.serial}`
            : "Equipo",
        price: priceMap.get(item.product_id) ?? 0,
        qty: 1,
        availableQty: 1,
        kind: "Equipo" as const,
      })),
      ...(accessories.data ?? []).map((item) => ({
        id: (item.products as unknown as { sku: string }).sku,
        productId: item.product_id,
        name: (item.products as unknown as { name: string }).name,
        detail: `SKU ${(item.products as unknown as { sku: string }).sku}`,
        price: priceMap.get(item.product_id) ?? 0,
        qty: Number(item.quantity),
        availableQty: Number(item.quantity),
        kind: "Accesorio" as const,
      })),
    ];
    setStock(rows);
    setMetrics({
      sales: (sales.data ?? []).reduce(
        (sum, item) => sum + Number(item.total),
        0,
      ),
      expenses: (expenses.data ?? []).reduce(
        (sum, item) => sum + Number(item.amount),
        0,
      ),
      value: (accessories.data ?? []).reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.average_cost),
        0,
      ),
      count: rows.reduce((sum, item) => sum + item.availableQty, 0),
    });
    setNotice("THOR conectado a Supabase. Almacén Central listo.");
  };

  // The delayed refresh reads the current Supabase session after authentication settles.
  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void refresh().catch((error) =>
        setNotice(
          error instanceof Error
            ? error.message
            : "Ejecuta las migraciones de Supabase antes de usar THOR.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(refreshTimer);
    // refresh intentionally runs after the session token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const addToCart = (item: StockItem) => {
    setCart((current) => {
      if (item.kind === "Equipo")
        return current.some((cartItem) => cartItem.id === item.id)
          ? current
          : [...current, { ...item, qty: 1 }];
      const existing = current.find(
        (cartItem) =>
          cartItem.kind === "Accesorio" &&
          cartItem.productId === item.productId,
      );
      if (existing)
        return existing.qty >= item.availableQty
          ? current
          : current.map((cartItem) =>
              cartItem === existing
                ? { ...cartItem, qty: cartItem.qty + 1 }
                : cartItem,
            );
      return [...current, { ...item, qty: 1 }];
    });
  };

  const updateAccessoryQuantity = (productId: string, quantity: number) => {
    setCart((current) =>
      current.flatMap((item) => {
        if (item.productId !== productId || item.kind !== "Accesorio")
          return [item];
        if (quantity < 1) return [];
        return [{ ...item, qty: Math.min(quantity, item.availableQty) }];
      }),
    );
  };

  const register = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !actor) return;
    const form = new FormData(event.currentTarget);
    const photo = form.get("photo");
    if (!(photo instanceof File) || !photo.size)
      return setNotice("La foto del equipo es obligatoria.");
    try {
      const category = String(form.get("category"));
      const sku = String(form.get("sku")).trim();
      const name = String(form.get("name")).trim();
      const imei = String(form.get("identifier")).trim();
      const cost = Number(form.get("cost") || 0);
      const price = Number(form.get("price") || 0);
      const key = `uploads/${actor.id}/${crypto.randomUUID()}.${photo.type.split("/")[1] || "jpg"}`;
      const upload = await supabase.storage
        .from("thor-files")
        .upload(key, photo, { contentType: photo.type });
      if (upload.error) throw upload.error;
      let product = await supabase
        .from("products")
        .select("id")
        .eq("sku", sku)
        .maybeSingle();
      if (product.error) throw product.error;
      if (!product.data)
        product = await supabase
          .from("products")
          .insert({
            sku,
            name,
            category,
            serialised: category !== "accessory",
            photo_path: key,
            active: true,
          })
          .select("id")
          .single();
      if (product.error || !product.data)
        throw product.error ?? new Error("No se pudo crear el producto.");
      const code = `${category === "phone" ? "CEL" : category === "laptop" ? "LAP" : "TAB"}-${Date.now().toString().slice(-7)}`;
      const item = await supabase
        .from("inventory_items")
        .insert({
          code,
          product_id: product.data.id,
          location_id: actor.locationId,
          imei_1: imei,
          cost,
          status: "available",
          photo_path: key,
        })
        .select("id")
        .single();
      if (item.error) throw item.error;
      await supabase
        .from("product_prices")
        .update({ active: false })
        .eq("product_id", product.data.id)
        .eq("location_id", actor.locationId)
        .eq("active", true);
      const priceSave = await supabase.from("product_prices").insert({
        product_id: product.data.id,
        location_id: actor.locationId,
        price,
        changed_by: actor.id,
        active: true,
      });
      if (priceSave.error) throw priceSave.error;
      setRegisterOpen(false);
      await refresh();
      setNotice(`Equipo ${name} registrado correctamente.`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el equipo.",
      );
    }
  };

  const completeSale = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !actor || !cart.length) return;
    const total = calculateCartTotal(cart);
    if (!paymentsMatchTotal(payments, total))
      return setNotice(
        "Los pagos deben coincidir exactamente con el total de la venta.",
      );
    setSavingSale(true);
    try {
      const { data, error } = await supabase.rpc("complete_sale", {
        p_location_id: actor.locationId,
        p_seller_id: actor.id,
        p_customer_name: customer.name,
        p_customer_dni: customer.dni,
        p_customer_phone: customer.phone,
        p_customer_address: customer.address,
        p_lines: cart.map((item) => ({
          product_id: item.productId,
          inventory_item_id: item.inventoryItemId ?? null,
          quantity: item.qty,
        })),
        p_payments: payments.map((payment) => ({
          method: payment.method,
          amount: Number(payment.amount),
        })),
      });
      if (error) throw error;
      const result = data as { code?: string; total?: number } | null;
      setCart([]);
      setCustomer(emptyCustomer);
      setPayments([newPayment()]);
      await refresh();
      setNotice(
        `Venta ${result?.code ?? ""} confirmada por ${money.format(Number(result?.total ?? total))}.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo confirmar la venta.",
      );
    } finally {
      setSavingSale(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setToken(null);
    setActor(null);
    setCart([]);
    setSection("inicio");
  };

  const items = useMemo(
    () =>
      stock.filter((item) =>
        `${item.id} ${item.name} ${item.detail}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [stock, query],
  );
  const total = calculateCartTotal(cart);
  const paid = paymentTotal(payments);
  if (!supabase) return <SetupNeeded />;
  if (!token)
    return (
      <Login
        onAuthenticated={(accessToken) => {
          setToken(accessToken);
          setNotice("Sesión iniciada. Conectando THOR…");
        }}
      />
    );

  return (
    <main className="thor-app">
      <aside className="side-nav">
        <div className="brand">
          <span className="bolt">ϟ</span>
          <span>THOR</span>
        </div>
        <p className="location-label">SEDE ACTIVA</p>
        <button className="location">Almacén Central</button>
        <nav>
          {(
            [
              "inicio",
              "inventario",
              "ventas",
              "caja",
              "usuarios",
              "manuales",
            ] as Section[]
          )
            .filter((name) => name !== "usuarios" || actor?.role !== "seller")
            .map((name) => (
              <button
                key={name}
                className={`nav-item ${section === name ? "active" : ""}`}
                onClick={() => setSection(name)}
              >
                {name === "inicio"
                  ? "⌂"
                  : name === "inventario"
                    ? "▦"
                    : name === "ventas"
                      ? "▱"
                      : name === "caja"
                        ? "◫"
                        : name === "usuarios"
                          ? "♙"
                          : "?"}{" "}
                {name === "manuales"
                  ? "Manuales"
                  : name === "usuarios"
                    ? "Usuarios"
                    : name[0].toUpperCase() + name.slice(1)}
              </button>
            ))}
        </nav>
        <div className="profile">
          <span className="avatar">
            {actor?.name.slice(0, 2).toUpperCase() ?? "TH"}
          </span>
          <div>
            <strong>{actor?.name ?? "THOR"}</strong>
            <small>{actor?.role ?? "Cargando"}</small>
          </div>
          <button
            className="sign-out"
            onClick={() => void signOut()}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            ↪
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">THOR · PERÚ</p>
            <h1>
              {section === "inicio"
                ? "Todo bajo control"
                : section[0].toUpperCase() + section.slice(1)}
            </h1>
          </div>
          <button className="quick" onClick={() => setSection("ventas")}>
            ＋ Nueva venta
          </button>
        </header>
        <div className="notice" role="status">
          <span>✓</span>
          {notice}
        </div>
        {section === "inicio" && (
          <div className="content">
            <section className="hero dashboard-hero">
              <div>
                <p className="eyebrow">OPERACIÓN EN TIEMPO REAL</p>
                <h2>Tu sede, bajo control.</h2>
                <p>
                  Consulta el estado de inventario, ventas y caja desde un solo
                  lugar.
                </p>
              </div>
              <button className="primary" onClick={() => setSection("ventas")}>
                Nueva venta
              </button>
            </section>
            <div className="metrics">
              <Metric
                label="Ventas del día"
                value={money.format(metrics.sales)}
                note="Ventas confirmadas"
              />
              <Metric
                label="Gastos del día"
                value={money.format(metrics.expenses)}
                note="Egresos registrados"
              />
              <Metric
                label="Inventario valorizado"
                value={money.format(metrics.value)}
                note={`${metrics.count} unidades disponibles`}
              />
            </div>
            <QuickGuide
              role={actor?.role as UserRole | undefined}
              onOpenInventory={() => setSection("inventario")}
              onOpenSales={() => setSection("ventas")}
            />
            <section className="card">
              <h2>Base real conectada</h2>
              <p>
                Inventario, usuarios y fotos se guardan directamente en
                Supabase. Las ventas confirmadas actualizan el stock como una
                sola operación.
              </p>
            </section>
          </div>
        )}
        {section === "inventario" && (
          <div className="content">
            <div className="page-actions">
              <label className="search">
                ⌕
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nombre, IMEI o código"
                />
              </label>
              <button className="primary" onClick={() => setRegisterOpen(true)}>
                ＋ Registrar equipo
              </button>
            </div>
            <section className="card table-card">
              {items.length ? (
                items.map((item) => (
                  <article className="inventory-row" key={item.id}>
                    <div className="product-image">
                      {item.kind === "Equipo" ? "▣" : "⌁"}
                    </div>
                    <div className="product">
                      <strong>{item.name}</strong>
                      <small>
                        {item.id} · {item.detail}
                      </small>
                    </div>
                    <span className="badge success">Disponible</span>
                    <div className="price">
                      <strong>{money.format(item.price)}</strong>
                      <small>{item.availableQty} unidades</small>
                    </div>
                    <button
                      className="row-action"
                      onClick={() => {
                        addToCart(item);
                        setSection("ventas");
                      }}
                    >
                      Vender
                    </button>
                  </article>
                ))
              ) : (
                <p className="empty">
                  Aún no hay inventario. Registra el primer equipo.
                </p>
              )}
            </section>
          </div>
        )}
        {section === "ventas" && (
          <div className="sale-layout">
            <section className="catalog">
              <label className="search">
                ⌕
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar producto"
                />
              </label>
              <div className="sale-products">
                {items.map((item) => (
                  <button
                    className="sale-product"
                    key={item.id}
                    onClick={() => addToCart(item)}
                  >
                    <strong>{item.name}</strong>
                    <small>
                      {money.format(item.price)} · {item.availableQty} disp.
                    </small>
                  </button>
                ))}
              </div>
            </section>
            <aside className="cart">
              <form onSubmit={completeSale}>
                <p className="eyebrow">VENTA NUEVA</p>
                <h2>Confirmar venta</h2>
                <div className="customer">
                  <label>
                    Cliente
                    <input
                      value={customer.name}
                      onChange={(event) =>
                        setCustomer({ ...customer, name: event.target.value })
                      }
                      placeholder="Cliente General"
                    />
                  </label>
                  <label>
                    DNI{" "}
                    <input
                      value={customer.dni}
                      onChange={(event) =>
                        setCustomer({ ...customer, dni: event.target.value })
                      }
                      placeholder="Opcional"
                    />
                  </label>
                </div>
                <div className="cart-lines">
                  {cart.length ? (
                    cart.map((item) => (
                      <div key={item.id}>
                        <span>
                          {item.name}
                          <small>
                            {item.qty} × {money.format(item.price)}
                          </small>
                        </span>
                        <b>{money.format(item.price * item.qty)}</b>
                        {item.kind === "Accesorio" && (
                          <span className="quantity">
                            <button
                              type="button"
                              onClick={() =>
                                updateAccessoryQuantity(
                                  item.productId,
                                  item.qty - 1,
                                )
                              }
                              aria-label={`Restar ${item.name}`}
                            >
                              −
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateAccessoryQuantity(
                                  item.productId,
                                  item.qty + 1,
                                )
                              }
                              aria-label={`Agregar ${item.name}`}
                            >
                              ＋
                            </button>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setCart((current) =>
                              current.filter(
                                (cartItem) => cartItem.id !== item.id,
                              ),
                            )
                          }
                          aria-label={`Quitar ${item.name}`}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="empty">Agrega productos para comenzar.</p>
                  )}
                </div>
                <div className="payment-head">
                  <strong>Pagos</strong>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setPayments((current) => [...current, newPayment()])
                    }
                  >
                    ＋ Combinar pago
                  </button>
                </div>
                <div className="payments">
                  {payments.map((payment, index) => (
                    <div className="payment-row" key={index}>
                      <select
                        value={payment.method}
                        onChange={(event) =>
                          setPayments((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, method: event.target.value }
                                : item,
                            ),
                          )
                        }
                      >
                        <option>Efectivo</option>
                        <option>Yape/Plin</option>
                        <option>Transferencia</option>
                        <option>Tarjeta</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={payment.amount}
                        onChange={(event) =>
                          setPayments((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    amount:
                                      event.target.value === ""
                                        ? ""
                                        : Number(event.target.value),
                                  }
                                : item,
                            ),
                          )
                        }
                        placeholder="Monto"
                      />
                      {payments.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPayments((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="text-button fill-payment"
                  onClick={() =>
                    setPayments((current) =>
                      current.map((payment, index) =>
                        index === 0
                          ? {
                              ...payment,
                              amount: Number(
                                (
                                  total - (paymentTotal(current.slice(1)) || 0)
                                ).toFixed(2),
                              ),
                            }
                          : payment,
                      ),
                    )
                  }
                >
                  Usar total pendiente
                </button>
                <div className="total">
                  <span>
                    Total <small>{money.format(paid)} pagado</small>
                  </span>
                  <strong>{money.format(total)}</strong>
                </div>
                <button
                  className="primary sale-button"
                  disabled={
                    !cart.length ||
                    savingSale ||
                    !paymentsMatchTotal(payments, total)
                  }
                  type="submit"
                >
                  {savingSale ? "Confirmando…" : "Confirmar venta"}
                </button>
                <small className="sale-note">
                  La venta se guarda con sus pagos y actualiza el stock
                  disponible.
                </small>
              </form>
            </aside>
          </div>
        )}
        {section === "caja" && (
          <div className="content">
            <section className="card">
              <p className="eyebrow">CAJA DE ALMACÉN CENTRAL</p>
              <h2>Resumen diario</h2>
              <div className="metrics">
                <Metric
                  label="Ventas"
                  value={money.format(metrics.sales)}
                  note="Hoy"
                />
                <Metric
                  label="Gastos"
                  value={money.format(metrics.expenses)}
                  note="Hoy"
                />
              </div>
            </section>
          </div>
        )}
        {section === "usuarios" && actor && <UserCenter actor={actor} />}
        {section === "manuales" && (
          <ManualCenter
            role={actor?.role as UserRole | undefined}
            onOpenSales={() => setSection("ventas")}
          />
        )}
      </section>
      {registerOpen && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={register}>
            <button
              type="button"
              className="close"
              onClick={() => setRegisterOpen(false)}
            >
              ×
            </button>
            <p className="eyebrow">ENTRADA DE INVENTARIO</p>
            <h2>Registrar equipo</h2>
            <label>
              Marca y modelo
              <input
                name="name"
                required
                autoFocus
                placeholder="Ej. Samsung Galaxy A56"
              />
            </label>
            <label>
              Tipo
              <select name="category" defaultValue="phone">
                <option value="phone">Celular</option>
                <option value="laptop">Laptop</option>
                <option value="tablet">Tablet</option>
              </select>
            </label>
            <label>
              SKU interno
              <input name="sku" required placeholder="Ej. SAM-A56-256" />
            </label>
            <label>
              IMEI, serial o código
              <input name="identifier" required />
            </label>
            <div className="two-fields">
              <label>
                Costo (S/)
                <input name="cost" type="number" min="0" step="0.01" required />
              </label>
              <label>
                Precio (S/)
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
            </div>
            <label>
              Foto del equipo
              <input
                name="photo"
                required
                type="file"
                accept="image/*"
                capture="environment"
              />
            </label>
            <button className="primary" type="submit">
              Guardar equipo
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <section className="metric">
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}

function QuickGuide({
  role,
  onOpenInventory,
  onOpenSales,
}: {
  role?: UserRole;
  onOpenInventory: () => void;
  onOpenSales: () => void;
}) {
  const guide =
    role === "seller"
      ? {
          title: "Guía rápida para vendedor",
          description:
            "Consulta existencias, arma la venta desde tu sede y confirma el pago completo.",
          action: "Ir a ventas",
          onAction: onOpenSales,
          steps: [
            "Busca el producto por nombre, IMEI o código.",
            "Añádelo a la venta y verifica el total.",
            "Registra el pago y confirma la venta.",
          ],
        }
      : role === "admin"
        ? {
            title: "Guía rápida para administrador",
            description:
              "Supervisa la operación diaria de tu sede: inventario, ventas y caja.",
            action: "Ver inventario",
            onAction: onOpenInventory,
            steps: [
              "Registra equipos con sus datos, costo, precio y foto.",
              "Revisa las ventas y movimientos de la sede.",
              "Controla el resumen diario de caja y gastos.",
            ],
          }
        : {
            title: "Guía rápida para superadministrador",
            description:
              "Controla la operación general y mantén la información de THOR ordenada y actualizada.",
            action: "Ver inventario",
            onAction: onOpenInventory,
            steps: [
              "Configura usuarios y sus permisos por sede.",
              "Supervisa inventario, ventas y caja de cada operación.",
              "Revisa auditoría y actualiza los manuales cuando cambie el sistema.",
            ],
          };
  return (
    <section className="quick-guide" aria-labelledby="quick-guide-title">
      <div>
        <p className="eyebrow">AYUDA SEGÚN TU USUARIO</p>
        <h2 id="quick-guide-title">{guide.title}</h2>
        <p>{guide.description}</p>
      </div>
      <ol>
        {guide.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <button className="secondary" onClick={guide.onAction}>
        {guide.action}
      </button>
    </section>
  );
}

function UserCenter({
  actor,
}: {
  actor: { id: string; name: string; role: string; locationId: string };
}) {
  const supabase = getSupabaseBrowser();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!supabase) return;
    const [userResult, locationResult] = await Promise.all([
      supabase
        .from("app_users")
        .select("id, name, email, role, active, locations(name)")
        .order("created_at", { ascending: true }),
      supabase.from("locations").select("id, name").eq("active", true),
    ]);
    if (userResult.error || locationResult.error) {
      setMessage("No se pudieron cargar los usuarios.");
      return;
    }
    setUsers((userResult.data ?? []) as ManagedUser[]);
    setLocations(locationResult.data ?? []);
  }, [supabase]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [loadUsers]);

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    const requestedRole = String(form.get("role") ?? "seller");
    const role = actor.role === "superadmin" ? requestedRole : "seller";
    setSavingId("new-user");
    setMessage("");
    const result = await supabase.functions.invoke("create-thor-user", {
      body: {
        name: String(form.get("name") ?? "").trim(),
        email: String(form.get("email") ?? "")
          .trim()
          .toLowerCase(),
        password: String(form.get("password") ?? ""),
        role,
        locationId: String(form.get("location_id") ?? actor.locationId),
      },
    });
    setSavingId(null);
    if (result.error) return setMessage(result.error.message);
    event.currentTarget.reset();
    setMessage("Usuario creado correctamente.");
    await loadUsers();
  };

  const updateRole = async (userId: string, role: "admin" | "seller") => {
    if (!supabase || actor.role !== "superadmin") return;
    setSavingId(userId);
    setMessage("");
    const result = await supabase
      .from("app_users")
      .update({ role })
      .eq("id", userId);
    setSavingId(null);
    if (result.error) return setMessage(result.error.message);
    setMessage("Rol actualizado correctamente.");
    await loadUsers();
  };

  if (actor.role === "seller") return null;
  return (
    <div className="content users-page">
      <section className="users-hero">
        <div>
          <p className="eyebrow">CONTROL DE ACCESO</p>
          <h2>Usuarios y permisos</h2>
          <p>
            Da acceso por correo, define el rol y deja cada cuenta ligada a su
            sede.
          </p>
        </div>
        <div className="users-count">
          <strong>{users.filter((user) => user.active).length}</strong>
          <span>usuarios activos</span>
        </div>
      </section>
      <div className="users-grid">
        <section className="card link-card">
          <p className="eyebrow">NUEVO USUARIO</p>
          <h3>Crear acceso desde THOR</h3>
          <p>
            {actor.role === "superadmin"
              ? "Puedes crear vendedores y administradores."
              : "Puedes crear cuentas de vendedor para tu sede."}
          </p>
          <form onSubmit={createUser} className="invite-form">
            <label>
              Nombre completo
              <input name="name" required placeholder="Ej. Ana Torres" />
            </label>
            <label>
              Correo
              <input
                name="email"
                type="email"
                required
                placeholder="ana@empresa.com"
              />
            </label>
            <label>
              Contrasena
              <input
                name="password"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <div className="two-fields">
              <label>
                Rol
                {actor.role === "superadmin" ? (
                  <select name="role" defaultValue="seller">
                    <option value="seller">Vendedor</option>
                    <option value="admin">Administrador</option>
                  </select>
                ) : (
                  <input readOnly value="Vendedor" />
                )}
              </label>
              <label>
                Sede
                {actor.role === "superadmin" ? (
                  <select name="location_id" defaultValue={actor.locationId}>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    readOnly
                    value={
                      locations.find(
                        (location) => location.id === actor.locationId,
                      )?.name ?? "Sede asignada"
                    }
                  />
                )}
              </label>
            </div>
            <button
              className="primary"
              type="submit"
              disabled={savingId === "new-user"}
            >
              {savingId === "new-user" ? "Creando..." : "Crear usuario"}
            </button>
          </form>
          {message && (
            <p className="users-message" role="status">
              {message}
            </p>
          )}
        </section>
        <section className="card user-howto">
          <p className="eyebrow">COMO DAR ACCESO</p>
          <h3>Acceso controlado</h3>
          <ol>
            <li>El administrador registra correo y contrasena.</li>
            <li>THOR crea la cuenta con el rol seleccionado.</li>
            <li>La persona ingresa con las credenciales que le entregues.</li>
          </ol>
          <p>
            El Superadmin es el unico que puede crear o asignar el rol de
            Administrador.
          </p>
        </section>
      </div>
      <section className="card users-list-card">
        <div className="card-head">
          <div>
            <p className="eyebrow">CUENTAS ACTIVAS</p>
            <h3>Usuarios de THOR</h3>
          </div>
          <span className="badge success">{users.length} registrados</span>
        </div>
        {users.length ? (
          <div className="users-list">
            {users.map((user) => (
              <article key={user.id}>
                <span className="user-avatar">
                  {user.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <strong>{user.name}</strong>
                  <small>
                    {user.email ?? "Sin correo registrado"} ·{" "}
                    {user.locations?.[0]?.name ?? "Sin sede"}
                  </small>
                </div>
                {actor.role === "superadmin" && user.role !== "superadmin" ? (
                  <select
                    className="user-role-select"
                    value={user.role}
                    disabled={savingId === user.id}
                    onChange={(event) =>
                      void updateRole(
                        user.id,
                        event.target.value as "admin" | "seller",
                      )
                    }
                    aria-label={`Rol de ${user.name}`}
                  >
                    <option value="seller">Vendedor</option>
                    <option value="admin">Administrador</option>
                  </select>
                ) : user.role === "superadmin" ? (
                  <span className="badge neutral">Superadmin</span>
                ) : (
                  <span className="badge neutral">
                    {user.role === "admin" ? "Administrador" : "Vendedor"}
                  </span>
                )}
                <span
                  className={user.active ? "badge success" : "badge warning"}
                >
                  {user.active ? "Activo" : "Inactivo"}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">Aun no hay usuarios cargados.</p>
        )}
      </section>
    </div>
  );
}

function ManualCenter({
  role,
  onOpenSales,
}: {
  role?: UserRole;
  onOpenSales: () => void;
}) {
  const roleManual =
    role === "seller"
      ? {
          name: "Vendedor",
          purpose:
            "Atender con rapidez y confirmar cada venta sin perder el control del stock.",
          steps: [
            "Busca el producto por nombre, IMEI o código.",
            "Agrega los artículos, revisa cantidades y registra el pago.",
            "Confirma la venta solo cuando el total esté pagado.",
          ],
          action: "Practicar una venta",
        }
      : role === "admin"
        ? {
            name: "Administrador",
            purpose: "Mantener la operación de la sede ordenada y verificable.",
            steps: [
              "Registra equipos con sus datos, costo, precio y evidencia.",
              "Revisa ventas, movimientos y diferencias de caja.",
              "Aprueba los cambios que requieran control administrativo.",
            ],
            action: "Ir a ventas",
          }
        : {
            name: "Superadministrador",
            purpose:
              "Definir el control general y asegurar que cada cambio quede documentado.",
            steps: [
              "Configura usuarios, permisos y sedes antes de iniciar la operación.",
              "Supervisa inventario, ventas, caja y auditoría.",
              "Actualiza los manuales por rol cuando cambie un módulo o permiso.",
            ],
            action: "Ir a ventas",
          };
  const modules = [
    [
      "Inventario",
      "Registrar, consultar y vender equipos o accesorios disponibles.",
      "Activo",
    ],
    [
      "Ventas",
      "Preparar la venta, registrar pagos y confirmar el descuento de stock.",
      "Activo",
    ],
    [
      "Caja",
      "Consultar el resumen diario de ventas y gastos de la sede.",
      "En evolución",
    ],
    [
      "Documentación",
      "Manual por rol y manual general que se actualizan con cada cambio.",
      "Vigente",
    ],
  ];
  return (
    <div className="content manuals-page">
      <section className="manuals-hero">
        <div>
          <p className="eyebrow">CENTRO DE AYUDA THOR</p>
          <h2>Manuales claros para cada persona.</h2>
          <p>
            Encuentra qué puedes hacer, cómo hacerlo y qué controles debes
            respetar en cada módulo.
          </p>
        </div>
        <div className="manual-version">
          <span>Manual general</span>
          <strong>Versión 1.0</strong>
          <small>Actualizado: 6 ago. 2026</small>
        </div>
      </section>
      <section className="manual-role">
        <div className="manual-role-icon">{roleManual.name.slice(0, 1)}</div>
        <div>
          <p className="eyebrow">TU MANUAL · {roleManual.name.toUpperCase()}</p>
          <h3>Cómo operar como {roleManual.name.toLowerCase()}</h3>
          <p>{roleManual.purpose}</p>
        </div>
        <button className="primary" onClick={onOpenSales}>
          {roleManual.action}
        </button>
      </section>
      <section className="manual-steps">
        {roleManual.steps.map((step, index) => (
          <article key={step}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <p>{step}</p>
          </article>
        ))}
      </section>
      <section className="manuals-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">MANUAL GENERAL DEL SISTEMA</p>
            <h3>Módulos y última actualización</h3>
          </div>
          <span className="manual-live">● Vigente</span>
        </div>
        <div className="manual-modules">
          {modules.map(([name, description, state]) => (
            <article key={name}>
              <div>
                <h4>{name}</h4>
                <p>{description}</p>
              </div>
              <span
                className={
                  state === "Activo" || state === "Vigente"
                    ? "badge success"
                    : "badge warning"
                }
              >
                {state}
              </span>
            </article>
          ))}
        </div>
      </section>
      <section className="manual-update">
        <div>
          <p className="eyebrow">REGLA DE ACTUALIZACIÓN</p>
          <h3>Cada módulo nuevo deja su manual listo antes de usarse.</h3>
          <p>
            Cuando cambie una función, interfaz o permiso, se actualiza el
            manual del rol afectado y este manual general.
          </p>
        </div>
        <span>✓</span>
      </section>
    </div>
  );
}
