"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  | "compras"
  | "ventas"
  | "caja"
  | "clientes"
  | "proveedores"
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
  salesCount: number;
  operational: number;
};
type SaleRecord = {
  id: string;
  code: string;
  customer_name: string;
  total: number;
  status: string;
  created_at: string;
};
type CashSession = {
  id: string;
  opened_by: string;
  opening_cash: number;
  opened_at: string;
  closed_at: string | null;
  counted_cash: number | null;
  note: string | null;
};
type ExpenseRecord = {
  id: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
  expense_date: string;
};
type UserRole = "superadmin" | "admin" | "seller";
type Payment = { method: string; amount: number | "" };
type Customer = { name: string; dni: string; phone: string; address: string };
type CustomerRecord = {
  id: string;
  name: string;
  dni: string | null;
  phone: string | null;
  address: string | null;
  active: boolean;
};
type SupplierRecord = {
  id: string;
  name: string;
  ruc: string | null;
  phone: string | null;
  contact: string | null;
  address: string | null;
  active: boolean;
};
type PurchaseLine = {
  sku: string;
  name: string;
  category: "accessory" | "phone" | "laptop" | "tablet";
  quantity: number;
  unit_cost: number | "";
  sale_price: number | "";
  identifiers: string;
};
type ManagedUser = {
  id: string;
  name: string;
  email: string | null;
  role: UserRole;
  active: boolean;
  avatar_path: string | null;
  locations: { name: string }[];
};
type LocationOption = { id: string; name: string };
type ActiveUser = {
  user_id: string;
  name: string;
  role: string;
  location_name: string | null;
  signed_in_at: string;
  last_seen_at: string;
  last_action: string;
};
type AuditEntry = {
  id: string;
  action: string;
  entity_type: string;
  detail: Record<string, unknown> | null;
  created_at: string;
  actor_name: string | null;
  actor_role: string | null;
};

const money = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
});
const emptyCustomer: Customer = { name: "", dni: "", phone: "", address: "" };
const newPayment = (): Payment => ({ method: "Efectivo", amount: "" });
const newPurchaseLine = (): PurchaseLine => ({
  sku: "",
  name: "",
  category: "accessory",
  quantity: 1,
  unit_cost: "",
  sale_price: "",
  identifiers: "",
});

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("inicio");
  const [notice, setNotice] = useState("");
  const [stock, setStock] = useState<StockItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({
    sales: 0,
    expenses: 0,
    value: 0,
    count: 0,
    salesCount: 0,
    operational: 0,
  });
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);
  const [salesView, setSalesView] = useState<"new" | "history">("new");
  const [cashOpen, setCashOpen] = useState(false);
  const [idleWarning, setIdleWarning] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<StockItem[]>([]);
  const [customer, setCustomer] = useState<Customer>(emptyCustomer);
  const [payments, setPayments] = useState<Payment[]>([newPayment()]);
  const [savingSale, setSavingSale] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [activitySessionKey] = useState(() => crypto.randomUUID());
  const [actor, setActor] = useState<{
    id: string;
    name: string;
    role: string;
    locationId: string;
    locationName: string;
    avatarPath: string | null;
  } | null>(null);
  const supabase = getSupabaseBrowser();
  const operationLocationId =
    actor?.role === "seller"
      ? actor.locationId
      : activeLocationId ?? actor?.locationId ?? "";
  const operationLocationName =
    locations.find((location) => location.id === operationLocationId)?.name ??
    actor?.locationName ??
    "Sede asignada";

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

  useEffect(() => {
    if (!supabase || !token) return;
    const idleMs = 15 * 60 * 1000;
    const warningMs = 13 * 60 * 1000;
    let warningTimer: number | undefined;
    let signOutTimer: number | undefined;
    const resetIdleTimer = () => {
      if (warningTimer) window.clearTimeout(warningTimer);
      if (signOutTimer) window.clearTimeout(signOutTimer);
      setIdleWarning(false);
      warningTimer = window.setTimeout(() => setIdleWarning(true), warningMs);
      signOutTimer = window.setTimeout(() => {
        void supabase
          .rpc("end_thor_activity", {
            p_session_key: activitySessionKey,
            p_reason: "session.inactive_timeout",
          })
          .then(() => supabase.auth.signOut())
          .then(() => {
            setToken(null);
            setIdleWarning(false);
            setNotice("La sesión se cerró tras 15 minutos sin actividad.");
          });
      }, idleMs);
    };
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "scroll",
      "touchstart",
      "focus",
    ];
    events.forEach((event) => window.addEventListener(event, resetIdleTimer));
    resetIdleTimer();
    return () => {
      events.forEach((event) => window.removeEventListener(event, resetIdleTimer));
      if (warningTimer) window.clearTimeout(warningTimer);
      if (signOutTimer) window.clearTimeout(signOutTimer);
    };
  }, [activitySessionKey, supabase, token]);

  useEffect(() => {
    if (!supabase || !actor?.avatarPath) return;
    let active = true;
    void supabase.storage
      .from("thor-files")
      .createSignedUrl(actor.avatarPath, 60 * 60)
      .then(({ data }) => {
        if (active) setAvatarUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [actor?.avatarPath, supabase]);

  useEffect(() => {
    const actorId = actor?.id;
    if (!supabase || !actorId) return;
    let active = true;
    void supabase
      .from("app_users")
      .select("avatar_path")
      .eq("id", actorId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error || !data?.avatar_path) return;
        setActor((current) =>
          current?.id === actorId
            ? { ...current, avatarPath: data.avatar_path }
            : current,
        );
      });
    return () => {
      active = false;
    };
  }, [actor?.id, supabase]);

  useEffect(() => {
    const actorId = actor?.id;
    if (!supabase || !token || !actorId) return;
    const touch = () =>
      supabase.rpc("touch_thor_activity", {
        p_session_key: activitySessionKey,
        p_action: "session.active",
      });
    void touch();
    const heartbeat = window.setInterval(() => {
      void touch();
    }, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void touch();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activitySessionKey, actor?.id, supabase, token]);

  const refresh = async (requestedLocationId?: string) => {
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
      locationName: "Sede asignada",
      avatarPath: null,
    };
    setActor(current);
    const locationId =
      current.role === "seller"
        ? current.locationId
        : requestedLocationId ?? activeLocationId ?? current.locationId;
    setActiveLocationId((previous) =>
      current.role === "seller" ? current.locationId : previous ?? current.locationId,
    );
    const locationList = await supabase
      .from("locations")
      .select("id, name")
      .eq("active", true)
      .order("name");
    if (locationList.error) throw locationList.error;
    setLocations((locationList.data ?? []) as LocationOption[]);
    const [serials, accessories, prices, sales, expenses, history, ownCash] =
      await Promise.all([
      supabase
        .from("inventory_items")
        .select("id, code, product_id, imei_1, serial, products!inner(name)")
        .eq("location_id", locationId)
        .eq("status", "available"),
      supabase
        .from("stock_balances")
        .select("product_id, quantity, average_cost, products!inner(name, sku)")
        .eq("location_id", locationId),
      supabase
        .from("product_prices")
        .select("product_id, price")
        .eq("location_id", locationId)
        .eq("active", true),
      supabase
        .from("sales")
        .select("total")
        .eq("location_id", locationId)
        .eq("status", "completed")
        .gte("created_at", new Date().toISOString().slice(0, 10)),
      supabase
        .from("expenses")
        .select("amount")
        .eq("location_id", locationId)
        .gte("expense_date", new Date().toISOString().slice(0, 10)),
      supabase
        .from("sales")
        .select("id, code, customer_name, total, status, created_at")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("cash_sessions")
        .select("id")
        .eq("location_id", locationId)
        .eq("opened_by", current.id)
        .is("closed_at", null)
        .limit(1),
    ]);
    for (const result of [serials, accessories, prices, sales, expenses, history, ownCash])
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
    const salesTotal = (sales.data ?? []).reduce(
        (sum, item) => sum + Number(item.total),
        0,
      );
    const expensesTotal = (expenses.data ?? []).reduce(
        (sum, item) => sum + Number(item.amount),
        0,
      );
    setSalesHistory((history.data ?? []) as SaleRecord[]);
    setCashOpen((ownCash.data ?? []).length > 0);
    setMetrics({
      sales: salesTotal,
      expenses: expensesTotal,
      value: (accessories.data ?? []).reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.average_cost),
        0,
      ),
      count: rows.reduce((sum, item) => sum + item.availableQty, 0),
      salesCount: (sales.data ?? []).length,
      operational: salesTotal - expensesTotal,
    });
    setNotice("");
  };

  // The delayed refresh reads the current Supabase session after authentication settles.
  useEffect(() => {
    const refreshTimer = window.setTimeout(() => {
      void refresh().catch((error) =>
        setNotice(
          error instanceof Error
            ? `No se pudo cargar tu perfil: ${error.message}`
            : "No se pudo cargar tu perfil ni la sede activa.",
        ),
      );
    }, 0);
    return () => window.clearTimeout(refreshTimer);
    // refresh intentionally runs after the session token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!supabase || !actor) return;
    const loadTimer = window.setTimeout(() => {
      void supabase
        .from("customers")
        .select("id, name, dni, phone, address, active")
        .eq("active", true)
        .order("name")
        .then((result) => {
          if (!result.error) setCustomers(result.data as CustomerRecord[]);
        });
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [actor, supabase]);

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const image = event.target.files?.[0];
    if (!image || !supabase || !actor) return;
    if (!image.type.startsWith("image/")) {
      setNotice("Selecciona una imagen para la foto de perfil.");
      return;
    }
    if (image.size > 5 * 1024 * 1024) {
      setNotice("La foto de perfil debe pesar como máximo 5 MB.");
      return;
    }
    try {
      const extension = image.type.split("/")[1] || "jpg";
      const path = `avatars/${actor.id}/${crypto.randomUUID()}.${extension}`;
      const upload = await supabase.storage
        .from("thor-files")
        .upload(path, image, { contentType: image.type });
      if (upload.error) throw upload.error;
      const update = await supabase.rpc("update_my_avatar", {
        p_avatar_path: path,
      });
      if (update.error) throw update.error;
      const signed = await supabase.storage
        .from("thor-files")
        .createSignedUrl(path, 60 * 60);
      if (signed.error) throw signed.error;
      setActor({ ...actor, avatarPath: path });
      setAvatarUrl(signed.data.signedUrl);
      setNotice("Foto de perfil actualizada.");
      event.target.value = "";
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la foto de perfil.",
      );
    }
  };

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
          location_id: operationLocationId,
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
        .eq("location_id", operationLocationId)
        .eq("active", true);
      const priceSave = await supabase.from("product_prices").insert({
        product_id: product.data.id,
        location_id: operationLocationId,
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
    if (!cashOpen) {
      setNotice("Abre tu caja antes de confirmar una venta.");
      setSection("caja");
      return;
    }
    const total = calculateCartTotal(cart);
    if (!paymentsMatchTotal(payments, total))
      return setNotice(
        "Los pagos deben coincidir exactamente con el total de la venta.",
      );
    setSavingSale(true);
    try {
      const { data, error } = await supabase.rpc("complete_sale", {
        p_location_id: operationLocationId,
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
    await supabase.rpc("end_thor_activity", {
      p_session_key: activitySessionKey,
      p_reason: "session.signed_out",
    });
    await supabase.auth.signOut();
    setToken(null);
    setActor(null);
    setCart([]);
    setSection("inicio");
  };

  const openNewRecord = () => {
    const targetBySection: Partial<Record<Section, string>> = {
      compras: "new-purchase",
      clientes: "new-customer",
      proveedores: "new-supplier",
      usuarios: "new-user",
    };
    const target = targetBySection[section];
    if (!target) {
      setSection("ventas");
      setSalesView("new");
      return;
    }
    document.getElementById(target)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(`#${target} input`)?.focus();
    }, 350);
  };

  const newRecordLabel =
    section === "compras"
      ? "Nueva recepción"
      : section === "clientes"
      ? "Nuevo cliente"
      : section === "proveedores"
        ? "Nuevo proveedor"
        : section === "usuarios"
          ? "Nuevo usuario"
          : "Nueva venta";

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
        {actor?.role === "seller" ? (
          <button className="location" disabled>{operationLocationName}</button>
        ) : (
          <select
            className="location location-selector"
            value={operationLocationId}
            onChange={(event) => {
              const locationId = event.target.value;
              setActiveLocationId(locationId);
              void refresh(locationId);
            }}
            aria-label="Cambiar sede operativa"
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.name}</option>
            ))}
          </select>
        )}
        <nav>
          {(
            [
              "inicio",
              "inventario",
              "compras",
              "ventas",
              "caja",
              "clientes",
              "proveedores",
              "usuarios",
              "manuales",
            ] as Section[]
          )
            .filter(
              (name) =>
                (name !== "usuarios" && name !== "compras") ||
                actor?.role !== "seller",
            )
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
                    : name === "compras"
                      ? "▣"
                    : name === "ventas"
                      ? "▱"
                      : name === "caja"
                        ? "◫"
                        : name === "clientes"
                          ? "♙"
                          : name === "proveedores"
                            ? "▤"
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
          <label className="avatar avatar-upload" title="Cambiar foto de perfil">
            {actor?.avatarPath && avatarUrl ? (
              <img src={avatarUrl} alt={`Foto de ${actor?.name ?? "usuario"}`} />
            ) : (
              actor?.name.slice(0, 2).toUpperCase() ?? "TH"
            )}
            <input type="file" accept="image/*" onChange={uploadAvatar} aria-label="Cambiar foto de perfil" />
          </label>
          <div>
            <strong>{actor?.name ?? "THOR"}</strong>
            <small>
              {actor?.role === "superadmin"
                ? "Superadministrador"
                : actor?.role === "admin"
                  ? "Administrador general"
                  : actor?.role === "seller"
                    ? "Vendedor"
                    : "Cargando"}
            </small>
          </div>
          <button
            className="sign-out"
            onClick={() => void signOut()}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <span aria-hidden="true">↪</span>
            <span className="sign-out-label">Salir</span>
          </button>
        </div>
        <div className="connection-status" role="status" title="THOR conectado a Supabase">
          <span aria-hidden="true">●</span> Conectado
        </div>
      </aside>
      <section className="workspace">
        {idleWarning && (
          <div className="idle-warning" role="status">
            Por seguridad, tu sesión se cerrará pronto por inactividad. Realiza una acción para continuar.
          </div>
        )}
        <header className="topbar">
          <div>
            <p className="eyebrow">THOR · PERÚ</p>
            <h1>
              {section === "inicio"
                ? "Todo bajo control"
                : section[0].toUpperCase() + section.slice(1)}
            </h1>
          </div>
          <button className="quick" onClick={openNewRecord}>
            ＋ {newRecordLabel}
          </button>
        </header>
        {notice && (
          <div className="notice" role="status">
            <span>✓</span>
            {notice}
          </div>
        )}
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
              <Metric
                label="Resultado operativo"
                value={money.format(metrics.operational)}
                note="Ventas menos gastos de hoy"
              />
            </div>
            <section className="card dashboard-sales">
              <div className="card-head">
                <div>
                  <p className="eyebrow">MOVIMIENTO RECIENTE</p>
                  <h3>Últimas ventas</h3>
                </div>
                <button className="text-button" onClick={() => setSection("ventas")}>
                  Ver ventas
                </button>
              </div>
              <SalesList sales={salesHistory.slice(0, 5)} compact />
            </section>
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
                        setSalesView("new");
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
        {section === "compras" && actor && actor.role !== "seller" && (
          <PurchaseCenter
            actor={{ ...actor, locationId: operationLocationId }}
            locationName={operationLocationName}
            cashOpen={cashOpen}
            onCompleted={refresh}
          />
        )}
        {section === "ventas" && (
          <div className="sale-layout">
            <section className="catalog">
              <div className="sale-section-head">
                <div>
                  <p className="eyebrow">OPERACIÓN COMERCIAL</p>
                  <h2>{salesView === "new" ? "Nueva venta" : "Historial de ventas"}</h2>
                </div>
                <div className="view-switch" role="tablist" aria-label="Vista de ventas">
                  <button className={salesView === "new" ? "selected" : ""} onClick={() => setSalesView("new")}>Nueva venta</button>
                  <button className={salesView === "history" ? "selected" : ""} onClick={() => setSalesView("history")}>Historial</button>
                </div>
              </div>
              {salesView === "new" ? (
                <>
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
                      <button className="sale-product" key={item.id} onClick={() => addToCart(item)}>
                        <strong>{item.name}</strong>
                        <small>{money.format(item.price)} · {item.availableQty} disp.</small>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <section className="card sales-history-card"><SalesList sales={salesHistory} /></section>
              )}
            </section>
            <aside className="cart">
              <form onSubmit={completeSale}>
                <p className="eyebrow">VENTA NUEVA</p>
                <h2>Confirmar venta</h2>
                <div className="customer">
                  <label>
                    Cliente registrado
                    <select
                      value={
                        customers.find(
                          (item) =>
                            item.name === customer.name &&
                            item.dni === (customer.dni || null),
                        )?.id ?? ""
                      }
                      onChange={(event) => {
                        const selected = customers.find(
                          (item) => item.id === event.target.value,
                        );
                        setCustomer(
                          selected
                            ? {
                                name: selected.name,
                                dni: selected.dni ?? "",
                                phone: selected.phone ?? "",
                                address: selected.address ?? "",
                              }
                            : emptyCustomer,
                        );
                      }}
                    >
                      <option value="">Cliente general</option>
                      {customers.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}{item.dni ? ` · DNI ${item.dni}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
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
                  <label>
                    Teléfono
                    <input
                      value={customer.phone}
                      onChange={(event) =>
                        setCustomer({ ...customer, phone: event.target.value })
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
                {!cashOpen && (
                  <div className="cash-required" role="alert">
                    <strong>Abre tu caja antes de vender.</strong>
                    <span>Ve al módulo Caja, registra el fondo inicial y luego confirma la venta.</span>
                    <button type="button" className="text-button" onClick={() => setSection("caja")}>Abrir caja</button>
                  </div>
                )}
                <button
                  className="primary sale-button"
                  disabled={
                    !cart.length ||
                    savingSale ||
                    !cashOpen ||
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
          <CashCenter
            actor={actor ? { ...actor, locationId: operationLocationId } : null}
            metrics={metrics}
            onChanged={refresh}
          />
        )}
        {section === "clientes" && actor && (
          <CustomerCenter
            actor={actor}
            customers={customers}
            onCreated={(created) =>
              setCustomers((current) =>
                [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
              )
            }
          />
        )}
        {section === "proveedores" && actor && <SupplierCenter actor={actor} />}
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

function SalesList({ sales, compact = false }: { sales: SaleRecord[]; compact?: boolean }) {
  if (!sales.length)
    return <p className="empty">Aún no hay ventas confirmadas en esta sede.</p>;
  return (
    <div className={compact ? "sales-list compact" : "sales-list"}>
      {sales.map((sale) => (
        <article key={sale.id}>
          <span className="movement-icon green">✓</span>
          <div>
            <strong>{sale.code}</strong>
            <small>{sale.customer_name || "Cliente General"} · {new Date(sale.created_at).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</small>
          </div>
          <span className="badge success">Confirmada</span>
          <b>{money.format(Number(sale.total))}</b>
        </article>
      ))}
    </div>
  );
}

function PurchaseCenter({
  actor,
  locationName,
  cashOpen,
  onCompleted,
}: {
  actor: { id: string; name: string; role: string; locationId: string };
  locationName: string;
  cashOpen: boolean;
  onCompleted: () => Promise<void>;
}) {
  const supabase = getSupabaseBrowser();
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [recentLots, setRecentLots] = useState<Array<{ id: string; code: string; receipt_number: string | null; total_cost: number; created_at: string; suppliers: { name: string }[] }>>([]);
  const [supplierId, setSupplierId] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [invoice, setInvoice] = useState<File | null>(null);
  const [lines, setLines] = useState<PurchaseLine[]>([newPurchaseLine()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const [supplierResult, lotResult] = await Promise.all([
      supabase.from("suppliers").select("id, name, ruc, phone, contact, address, active").eq("active", true).order("name"),
      supabase.from("receipt_lots").select("id, code, receipt_number, total_cost, created_at, suppliers(name)").eq("location_id", actor.locationId).order("created_at", { ascending: false }).limit(8),
    ]);
    if (supplierResult.error || lotResult.error) {
      setMessage("No se pudieron cargar proveedores o recepciones.");
      return;
    }
    setSuppliers((supplierResult.data ?? []) as SupplierRecord[]);
    setRecentLots((lotResult.data ?? []) as Array<{ id: string; code: string; receipt_number: string | null; total_cost: number; created_at: string; suppliers: { name: string }[] }>);
  }, [actor.locationId, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const total = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_cost || 0),
    0,
  );
  const updateLine = <K extends keyof PurchaseLine>(index: number, key: K, value: PurchaseLine[K]) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, [key]: value } : line));
  };

  const savePurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !supplierId || !receiptNumber.trim()) {
      setMessage("Selecciona el proveedor e ingresa el número de factura o guía.");
      return;
    }
    if (!lines.length || lines.some((line) => !line.sku.trim() || !line.name.trim() || !line.quantity || line.unit_cost === "" || line.sale_price === "")) {
      setMessage("Completa SKU, producto, cantidad, costo y precio en cada línea.");
      return;
    }
    if ((paymentMethod === "cash_box" || paymentMethod === "central_cash") && !cashOpen) {
      setMessage("Abre tu caja antes de registrar un pago en efectivo.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      let invoicePath = "";
      if (invoice) {
        const extension = invoice.name.split(".").pop() || "file";
        invoicePath = `receipts/${actor.id}/${crypto.randomUUID()}.${extension}`;
        const upload = await supabase.storage.from("thor-files").upload(invoicePath, invoice, { contentType: invoice.type || "application/octet-stream" });
        if (upload.error) throw upload.error;
      }
      const result = await supabase.rpc("receive_supplier_lot", {
        p_supplier_id: supplierId,
        p_location_id: actor.locationId,
        p_receipt_number: receiptNumber.trim(),
        p_payment_method: paymentMethod,
        p_receipt_photo_path: invoicePath,
        p_lines: lines.map((line) => ({
          sku: line.sku.trim(),
          name: line.name.trim(),
          category: line.category,
          quantity: Number(line.quantity),
          unit_cost: Number(line.unit_cost),
          sale_price: Number(line.sale_price),
          identifiers: line.identifiers.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean),
        })),
      });
      if (result.error) throw result.error;
      const data = result.data as { code?: string } | null;
      setSupplierId("");
      setReceiptNumber("");
      setInvoice(null);
      setLines([newPurchaseLine()]);
      setMessage(`Recepción ${data?.code ?? ""} registrada y pagada correctamente.`);
      await Promise.all([load(), onCompleted()]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo registrar la compra.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content purchases-page">
      <section className="purchases-hero">
        <div><p className="eyebrow">ABASTECIMIENTO Y TESORERÍA</p><h2>Compras y recepción por lote</h2><p>Registra una llegada completa, su factura y el pago inmediato. El stock entra directamente a <strong>{locationName}</strong>.</p></div>
        <div className="purchase-total"><span>Total de la recepción</span><strong>{money.format(total)}</strong><small>Sin crédito a proveedores</small></div>
      </section>
      <form className="purchase-form" id="new-purchase" onSubmit={savePurchase}>
        <section className="card purchase-header-card">
          <div className="card-head"><div><p className="eyebrow">01 · DOCUMENTO Y PAGO</p><h3>Datos de la llegada</h3></div><span className="badge success">Pago inmediato</span></div>
          <div className="purchase-fields">
            <label>Proveedor<select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} required><option value="">Selecciona un proveedor</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.ruc ? ` · RUC ${supplier.ruc}` : ""}</option>)}</select></label>
            <label>Factura o guía<input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} required placeholder="Ej. F001-000245" /></label>
            <label>Origen del pago<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="bank_transfer">Transferencia bancaria · tesorería central</option><option value="yape_plin">Yape / Plin · tesorería central</option><option value="cash_box">Efectivo · caja de esta sede</option><option value="central_cash">Efectivo · caja central</option></select></label>
            <label>Factura o comprobante<input type="file" accept="image/*,.pdf" onChange={(event) => setInvoice(event.target.files?.[0] ?? null)} /><small>Opcional: imagen o PDF.</small></label>
          </div>
          {(paymentMethod === "cash_box" || paymentMethod === "central_cash") && !cashOpen && <p className="cash-required"><strong>La caja está cerrada.</strong> Abre tu caja antes de pagar esta recepción en efectivo.</p>}
          {paymentMethod === "central_cash" && <p className="purchase-tip">Para usar efectivo central, selecciona primero <strong>Almacén Central</strong> como sede activa.</p>}
        </section>
        <section className="card purchase-lines-card">
          <div className="card-head"><div><p className="eyebrow">02 · PRODUCTOS DEL LOTE</p><h3>Mercadería recibida</h3><p>Para cargadores usa cantidad. Para celulares, registra un IMEI o serie por cada unidad.</p></div><button type="button" className="secondary" onClick={() => setLines((current) => [...current, newPurchaseLine()])}>＋ Agregar producto</button></div>
          <div className="purchase-lines">{lines.map((line, index) => <article key={index} className="purchase-line"><div className="line-title"><strong>Producto {String(index + 1).padStart(2, "0")}</strong>{lines.length > 1 && <button type="button" className="text-button danger" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}>Quitar</button>}</div><div className="purchase-line-grid"><label>SKU<input value={line.sku} onChange={(event) => updateLine(index, "sku", event.target.value)} placeholder="Ej. APP-CHG-20W" required /></label><label>Producto<input value={line.name} onChange={(event) => updateLine(index, "name", event.target.value)} placeholder="Ej. Cargador USB-C 20W" required /></label><label>Tipo<select value={line.category} onChange={(event) => updateLine(index, "category", event.target.value as PurchaseLine["category"])}><option value="accessory">Accesorio / cargador</option><option value="phone">Celular</option><option value="laptop">Laptop</option><option value="tablet">Tablet</option></select></label><label>Cantidad<input type="number" min="1" value={line.quantity} onChange={(event) => updateLine(index, "quantity", Math.max(1, Number(event.target.value)))} required /></label><label>Costo unitario<input type="number" min="0" step="0.01" value={line.unit_cost} onChange={(event) => updateLine(index, "unit_cost", event.target.value === "" ? "" : Number(event.target.value))} required /></label><label>Precio de venta<input type="number" min="0" step="0.01" value={line.sale_price} onChange={(event) => updateLine(index, "sale_price", event.target.value === "" ? "" : Number(event.target.value))} required /></label></div>{line.category !== "accessory" && <label className="identifiers-field">IMEI o serie <textarea value={line.identifiers} onChange={(event) => updateLine(index, "identifiers", event.target.value)} required placeholder="Uno por línea o separado por comas. Debe coincidir con la cantidad." /></label>}<div className="line-subtotal">Subtotal de línea <strong>{money.format(Number(line.quantity || 0) * Number(line.unit_cost || 0))}</strong></div></article>)}</div>
          <div className="purchase-submit"><div><span>Total pagado al proveedor</span><strong>{money.format(total)}</strong></div><button className="primary" type="submit" disabled={saving || !total}>{saving ? "Registrando recepción..." : "Confirmar recepción y pago"}</button></div>
          {message && <p className="users-message" role="status">{message}</p>}
        </section>
      </form>
      <section className="card recent-lots"><div className="card-head"><div><p className="eyebrow">HISTORIAL DE LA SEDE</p><h3>Últimas recepciones</h3></div><span className="badge neutral">{recentLots.length} recientes</span></div>{recentLots.length ? <div className="cash-list">{recentLots.map((lot) => <article key={lot.id}><div><strong>{lot.code}</strong><small>{lot.suppliers?.[0]?.name ?? "Proveedor"} · Factura {lot.receipt_number ?? "sin número"} · {new Date(lot.created_at).toLocaleDateString("es-PE")}</small></div><b>{money.format(Number(lot.total_cost))}</b></article>)}</div> : <p className="empty">Aún no hay lotes registrados para esta sede.</p>}</section>
    </div>
  );
}

function CashCenter({
  actor,
  metrics,
  onChanged,
}: {
  actor: { id: string; name: string; role: string; locationId: string } | null;
  metrics: Metrics;
  onChanged: () => Promise<void>;
}) {
  const supabase = getSupabaseBrowser();
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !actor) return;
    const [sessionResult, expenseResult] = await Promise.all([
      supabase.from("cash_sessions").select("id, opened_by, opening_cash, opened_at, closed_at, counted_cash, note").eq("location_id", actor.locationId).order("opened_at", { ascending: false }).limit(8),
      supabase.from("expenses").select("id, category, description, amount, payment_method, expense_date").eq("location_id", actor.locationId).order("expense_date", { ascending: false }).limit(8),
    ]);
    if (sessionResult.error || expenseResult.error) {
      setMessage("No se pudo cargar el detalle de caja.");
      return;
    }
    setSessions((sessionResult.data ?? []) as CashSession[]);
    setExpenses((expenseResult.data ?? []) as ExpenseRecord[]);
  }, [actor, supabase]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [load]);

  if (!actor) return null;
  const activeSession = sessions.find(
    (session) => !session.closed_at && session.opened_by === actor.id,
  );
  const canManageExpenses = actor.role !== "seller";

  const saveOpening = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await supabase.from("cash_sessions").insert({
      location_id: actor.locationId,
      opened_by: actor.id,
      opening_cash: Number(form.get("opening_cash") ?? 0),
      note: String(form.get("note") ?? "").trim() || null,
    });
    setSaving(false);
    if (result.error) return setMessage(result.error.message);
    setMessage("Caja abierta correctamente.");
    await Promise.all([load(), onChanged()]);
  };

  const closeCash = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || !activeSession) return;
    const counted = Number(new FormData(event.currentTarget).get("counted_cash") ?? 0);
    setSaving(true);
    const result = await supabase.from("cash_sessions").update({
      closed_at: new Date().toISOString(),
      counted_cash: counted,
      approved_by: actor.id,
    }).eq("id", activeSession.id);
    setSaving(false);
    if (result.error) return setMessage(result.error.message);
    setMessage("Caja cerrada correctamente.");
    await Promise.all([load(), onChanged()]);
  };

  const registerExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await supabase.from("expenses").insert({
      cash_session_id: activeSession?.id ?? null,
      location_id: actor.locationId,
      recorded_by: actor.id,
      category: String(form.get("category") ?? "Operativo"),
      description: String(form.get("description") ?? "").trim(),
      amount: Number(form.get("amount") ?? 0),
      payment_method: String(form.get("payment_method") ?? "Efectivo"),
      expense_date: String(form.get("expense_date") ?? new Date().toISOString().slice(0, 10)),
    });
    setSaving(false);
    if (result.error) return setMessage(result.error.message);
    event.currentTarget.reset();
    setMessage("Gasto registrado correctamente.");
    await Promise.all([load(), onChanged()]);
  };

  return (
    <div className="content cash-page">
      <section className="cash-banner">
        <div>
          <p className="eyebrow">CAJA DE LA SEDE</p>
          <h2>{activeSession ? "Caja abierta" : "Caja pendiente de apertura"}</h2>
          <p>{activeSession ? `Tu caja está abierta desde ${new Date(activeSession.opened_at).toLocaleString("es-PE")}.` : "Debes abrir tu propia caja antes de registrar una venta."}</p>
        </div>
        <span className={activeSession ? "badge success" : "badge warning"}>{activeSession ? "Activa" : "Sin abrir"}</span>
      </section>
      <div className="metrics">
        <Metric label="Ventas del día" value={money.format(metrics.sales)} note={`${metrics.salesCount} confirmadas`} />
        <Metric label="Gastos del día" value={money.format(metrics.expenses)} note="Egresos registrados" />
        <Metric label="Resultado operativo" value={money.format(metrics.operational)} note="Antes del arqueo" />
        <Metric label="Fondo inicial" value={money.format(Number(activeSession?.opening_cash ?? 0))} note={activeSession ? "Caja activa" : "Sin sesión"} />
      </div>
      <div className="cash-grid">
        <section className="card">
          <div className="card-head"><div><p className="eyebrow">CONTROL DE SESIÓN</p><h3>{activeSession ? "Cerrar caja" : "Abrir caja"}</h3></div></div>
          {activeSession ? (
            <form className="cash-form" onSubmit={closeCash}>
              <label>Efectivo contado<input name="counted_cash" type="number" min="0" step="0.01" required /></label>
              <button className="primary" disabled={saving}>{saving ? "Guardando..." : "Cerrar caja"}</button>
            </form>
          ) : (
            <form className="cash-form" onSubmit={saveOpening}>
              <label>Fondo inicial (S/)<input name="opening_cash" type="number" min="0" step="0.01" required /></label>
              <label>Nota<input name="note" placeholder="Ej. Apertura turno mañana" /></label>
              <button className="primary" disabled={saving}>{saving ? "Guardando..." : "Abrir caja"}</button>
            </form>
          )}
          {message && <p className="users-message" role="status">{message}</p>}
        </section>
        <section className="card">
          <p className="eyebrow">GASTO OPERATIVO</p><h3>Registrar egreso</h3>
          {canManageExpenses ? <form className="cash-form" onSubmit={registerExpense}>
            <div className="two-fields"><label>Categoría<input name="category" defaultValue="Operativo" required /></label><label>Monto (S/)<input name="amount" type="number" min="0.01" step="0.01" required /></label></div>
            <label>Descripción<input name="description" required placeholder="Ej. Transporte o embalaje" /></label>
            <div className="two-fields"><label>Método<select name="payment_method"><option>Efectivo</option><option>Yape/Plin</option><option>Transferencia</option></select></label><label>Fecha<input name="expense_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label></div>
            <button className="secondary" disabled={saving}>Registrar gasto</button>
          </form> : <p className="empty">Los gastos los registra un administrador.</p>}
        </section>
      </div>
      <div className="cash-grid">
        <section className="card"><p className="eyebrow">ÚLTIMOS EGRESOS</p><h3>Gastos registrados</h3><ExpenseList expenses={expenses} /></section>
        <section className="card"><p className="eyebrow">HISTORIAL DE CAJA</p><h3>Sesiones recientes</h3><CashSessionList sessions={sessions} /></section>
      </div>
    </div>
  );
}

function ExpenseList({ expenses }: { expenses: ExpenseRecord[] }) {
  if (!expenses.length) return <p className="empty">Aún no hay gastos registrados.</p>;
  return <div className="cash-list">{expenses.map((expense) => <article key={expense.id}><div><strong>{expense.description}</strong><small>{expense.category} · {expense.expense_date} · {expense.payment_method}</small></div><b>- {money.format(Number(expense.amount))}</b></article>)}</div>;
}

function CashSessionList({ sessions }: { sessions: CashSession[] }) {
  if (!sessions.length) return <p className="empty">Aún no hay sesiones de caja.</p>;
  return <div className="cash-list">{sessions.map((session) => <article key={session.id}><div><strong>{session.closed_at ? "Caja cerrada" : "Caja abierta"}</strong><small>{new Date(session.opened_at).toLocaleString("es-PE")}</small></div><div className="cash-session-values"><b>Inicio {money.format(Number(session.opening_cash))}</b>{session.closed_at && <small>Arqueo {money.format(Number(session.counted_cash ?? 0))}</small>}</div></article>)}</div>;
}

function CustomerCenter({
  actor,
  customers,
  onCreated,
}: {
  actor: { id: string; name: string; role: string; locationId: string };
  customers: CustomerRecord[];
  onCreated: (customer: CustomerRecord) => void;
}) {
  const supabase = getSupabaseBrowser();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const visibleCustomers = customers.filter((customer) =>
    `${customer.name} ${customer.dni ?? ""} ${customer.phone ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const createCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await supabase
      .from("customers")
      .insert({
        name: String(form.get("name") ?? "").trim(),
        dni: String(form.get("dni") ?? "").trim() || null,
        phone: String(form.get("phone") ?? "").trim() || null,
        address: String(form.get("address") ?? "").trim() || null,
        created_by: actor.id,
        active: true,
      })
      .select("id, name, dni, phone, address, active")
      .single();
    setSaving(false);
    if (result.error) {
      setMessage(
        result.error.code === "23505"
          ? "Ya existe un cliente con ese DNI."
          : result.error.message,
      );
      return;
    }
    event.currentTarget.reset();
    onCreated(result.data as CustomerRecord);
    setMessage("Cliente registrado correctamente.");
  };

  return (
    <div className="content directory-page">
      <section className="directory-hero">
        <div><p className="eyebrow">BASE COMERCIAL</p><h2>Clientes</h2><p>Registra personas con DNI y reutiliza sus datos al vender. Si no deseas identificar a la persona, selecciona Cliente general.</p></div>
        <div className="users-count"><strong>{customers.length}</strong><span>clientes registrados</span></div>
      </section>
      <div className="directory-grid">
        <section className="card" id="new-customer">
          <p className="eyebrow">NUEVO CLIENTE</p><h3>Registrar cliente</h3>
          <form className="directory-form" onSubmit={createCustomer}>
            <label>Nombre completo<input name="name" required placeholder="Ej. María Pérez" /></label>
            <div className="two-fields"><label>DNI<input name="dni" inputMode="numeric" maxLength={12} placeholder="Opcional" /></label><label>Teléfono<input name="phone" placeholder="Opcional" /></label></div>
            <label>Dirección<input name="address" placeholder="Opcional" /></label>
            <button className="primary" disabled={saving}>{saving ? "Guardando..." : "Guardar cliente"}</button>
          </form>
          {message && <p className="users-message" role="status">{message}</p>}
        </section>
        <section className="card customer-general-card">
          <p className="eyebrow">VENTA RÁPIDA</p><h3>Cliente general</h3>
          <p>En una venta puedes dejar el cliente como general. Si luego deseas identificarlo, regístralo aquí y selecciónalo directamente desde la pantalla de venta.</p>
          <span className="badge neutral">No requiere DNI</span>
        </section>
      </div>
      <section className="card directory-list-card">
        <div className="card-head"><div><p className="eyebrow">DIRECTORIO</p><h3>Clientes registrados</h3></div><label className="search directory-search">⌕<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, DNI o teléfono" /></label></div>
        {visibleCustomers.length ? <div className="directory-list">{visibleCustomers.map((customer) => <article key={customer.id}><span className="user-avatar">{customer.name.slice(0, 2).toUpperCase()}</span><div><strong>{customer.name}</strong><small>{customer.dni ? `DNI ${customer.dni}` : "Sin DNI"}{customer.phone ? ` · ${customer.phone}` : ""}{customer.address ? ` · ${customer.address}` : ""}</small></div><span className="badge success">Activo</span></article>)}</div> : <p className="empty">No se encontraron clientes.</p>}
      </section>
    </div>
  );
}

function SupplierCenter({ actor }: { actor: { id: string; name: string; role: string; locationId: string } }) {
  const supabase = getSupabaseBrowser();
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const canManage = actor.role !== "seller";
  const load = useCallback(async () => {
    if (!supabase) return;
    const result = await supabase.from("suppliers").select("id, name, ruc, phone, contact, address, active").order("name");
    if (result.error) return setMessage("No se pudieron cargar los proveedores.");
    setSuppliers(result.data as SupplierRecord[]);
  }, [supabase]);
  useEffect(() => {
    const loadTimer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(loadTimer);
  }, [load]);
  const createSupplier = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    const result = await supabase.from("suppliers").insert({
      name: String(form.get("name") ?? "").trim(),
      ruc: String(form.get("ruc") ?? "").trim() || null,
      phone: String(form.get("phone") ?? "").trim() || null,
      contact: String(form.get("contact") ?? "").trim() || null,
      address: String(form.get("address") ?? "").trim() || null,
      active: true,
    });
    setSaving(false);
    if (result.error) return setMessage(result.error.message);
    event.currentTarget.reset();
    setMessage("Proveedor registrado correctamente.");
    await load();
  };
  return (
    <div className="content directory-page">
      <section className="directory-hero"><div><p className="eyebrow">COMPRAS Y ABASTECIMIENTO</p><h2>Proveedores</h2><p>Centraliza RUC, contacto y teléfono de quienes abastecen la operación.</p></div><div className="users-count"><strong>{suppliers.filter((item) => item.active).length}</strong><span>proveedores activos</span></div></section>
      <div className="directory-grid">
        <section className="card" id="new-supplier"><p className="eyebrow">NUEVO PROVEEDOR</p><h3>Registrar proveedor</h3>
          {canManage ? <form className="directory-form" onSubmit={createSupplier}><label>Razón social o nombre<input name="name" required placeholder="Ej. Distribuidora Lima SAC" /></label><div className="two-fields"><label>RUC<input name="ruc" inputMode="numeric" maxLength={16} placeholder="Opcional" /></label><label>Teléfono<input name="phone" placeholder="Opcional" /></label></div><label>Contacto<input name="contact" placeholder="Ej. Luis Torres" /></label><label>Dirección<input name="address" placeholder="Opcional" /></label><button className="primary" disabled={saving}>{saving ? "Guardando..." : "Guardar proveedor"}</button></form> : <p className="empty">El vendedor puede consultar proveedores; el registro es administrativo.</p>}
          {message && <p className="users-message" role="status">{message}</p>}
        </section>
        <section className="card customer-general-card"><p className="eyebrow">SIGUIENTE PASO</p><h3>Ingreso de mercadería</h3><p>Los proveedores registrados estarán disponibles para asociar nuevos lotes y compras de inventario.</p><span className="badge neutral">Control administrativo</span></section>
      </div>
      <section className="card directory-list-card"><div className="card-head"><div><p className="eyebrow">DIRECTORIO</p><h3>Proveedores registrados</h3></div><span className="badge success">{suppliers.length} registrados</span></div>
        {suppliers.length ? <div className="directory-list">{suppliers.map((supplier) => <article key={supplier.id}><span className="user-avatar">{supplier.name.slice(0, 2).toUpperCase()}</span><div><strong>{supplier.name}</strong><small>{supplier.ruc ? `RUC ${supplier.ruc}` : "Sin RUC"}{supplier.contact ? ` · ${supplier.contact}` : ""}{supplier.phone ? ` · ${supplier.phone}` : ""}{supplier.address ? ` · ${supplier.address}` : ""}</small></div><span className={supplier.active ? "badge success" : "badge warning"}>{supplier.active ? "Activo" : "Inactivo"}</span></article>)}</div> : <p className="empty">Aún no hay proveedores registrados.</p>}
      </section>
    </div>
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
  if (role === "seller") {
    guide.steps.unshift("Abre tu caja antes de iniciar ventas; THOR bloqueará la venta si no está abierta.");
  } else if (role === "admin") {
    guide.steps.unshift("Selecciona la sede operativa en el menú lateral para gestionar cada almacén.");
  } else {
    guide.steps.unshift("Crea administradores y revisa que cada vendedor tenga una sede correctamente asignada.");
  }
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
        .select("id, name, email, role, active, avatar_path, locations(name)")
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
    await supabase.from("audit_log").insert({
      actor_id: actor.id,
      action: "user.role_changed",
      entity_type: "app_user",
      entity_id: userId,
      detail: { role },
    });
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
        <section className="card link-card" id="new-user">
          <p className="eyebrow">NUEVO USUARIO</p>
          <h3>Crear acceso desde THOR</h3>
          <p>
            {actor.role === "superadmin"
              ? "Puedes crear vendedores y administradores."
              : "Puedes crear vendedores y asignarlos a cualquier sede."}
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
                {actor.role !== "seller" ? (
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
            El Superusuario crea administradores. El Administrador general
            puede crear vendedores para cualquier almacén, pero no eleva roles.
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
                <UserAvatar user={user} />
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
      {actor.role === "superadmin" && <SuperAdminActivity />}
    </div>
  );
}

function SuperAdminActivity() {
  const supabase = getSupabaseBrowser();
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!supabase) return;
    const [activity, audit] = await Promise.all([
      supabase.rpc("get_superadmin_activity"),
      supabase.rpc("get_superadmin_audit_log", { p_limit: 60 }),
    ]);
    if (activity.error || audit.error) {
      setMessage("No se pudo cargar el panel de supervisión.");
      return;
    }
    setActiveUsers((activity.data ?? []) as ActiveUser[]);
    setAuditEntries((audit.data ?? []) as AuditEntry[]);
    setMessage("");
  }, [supabase]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void load();
    }, 0);
    const timer = window.setInterval(() => {
      setNow(Date.now());
      void load();
    }, 30_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [load]);

  return (
    <section className="superadmin-activity">
      <div className="superadmin-head">
        <div>
          <p className="eyebrow">SUPERVISIÓN EXCLUSIVA</p>
          <h3>Actividad de THOR</h3>
          <p>Solo el Superadministrador puede ver quién está conectado y las acciones registradas.</p>
        </div>
        <button className="secondary" onClick={() => void load()}>Actualizar</button>
      </div>
      {message && <p className="users-message" role="status">{message}</p>}
      <div className="activity-grid">
        <section className="card activity-card">
          <div className="card-head"><div><p className="eyebrow">USUARIOS CONECTADOS</p><h3>{activeUsers.length} en línea</h3></div><span className="connection-pill"><i /> En tiempo real</span></div>
          {activeUsers.length ? <div className="activity-users">{activeUsers.map((user) => <article key={`${user.user_id}-${user.signed_in_at}`}><span className="user-avatar">{user.name.slice(0, 2).toUpperCase()}</span><div><strong>{user.name}</strong><small>{roleName(user.role)} · {user.location_name ?? "Sin sede"}</small><small>Activo {timeSince(user.signed_in_at, now)} · última señal {timeSince(user.last_seen_at, now)}</small></div><span className="badge success">Conectado</span></article>)}</div> : <p className="empty">No hay usuarios con actividad en los últimos 3 minutos.</p>}
        </section>
        <section className="card activity-card audit-card">
          <div className="card-head"><div><p className="eyebrow">BITÁCORA DE ACCIONES</p><h3>Últimos movimientos</h3></div><span className="badge neutral">{auditEntries.length} registros</span></div>
          {auditEntries.length ? <div className="audit-list">{auditEntries.map((entry) => <article key={entry.id}><span className="audit-dot" /><div><strong>{auditLabel(entry.action)}</strong><small>{entry.actor_name ?? "Sistema"} · {roleName(entry.actor_role ?? "")}</small><small>{new Date(entry.created_at).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}{entry.detail?.code ? ` · ${String(entry.detail.code)}` : ""}</small></div></article>)}</div> : <p className="empty">Aún no hay movimientos en la bitácora.</p>}
        </section>
      </div>
    </section>
  );
}

function roleName(role: string) {
  return role === "superadmin" ? "Superadministrador" : role === "admin" ? "Administrador" : role === "seller" ? "Vendedor" : "Sistema";
}

function auditLabel(action: string) {
  const labels: Record<string, string> = {
    "session.started": "Inicio de sesión",
    "session.signed_out": "Cierre de sesión",
    "session.inactive_timeout": "Sesión cerrada por inactividad",
    "sale.completed": "Venta confirmada",
  };
  return labels[action] ?? action.replaceAll(".", " · ");
}

function timeSince(value: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "hace instantes";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h ${minutes % 60} min`;
}

function UserAvatar({ user }: { user: ManagedUser }) {
  const supabase = getSupabaseBrowser();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase || !user.avatar_path) return;
    let active = true;
    void supabase.storage
      .from("thor-files")
      .createSignedUrl(user.avatar_path, 60 * 60)
      .then(({ data }) => {
        if (active) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      active = false;
    };
  }, [supabase, user.avatar_path]);
  return (
    <span className="user-avatar">
      {user.avatar_path && url ? <img src={url} alt={`Foto de ${user.name}`} /> : user.name.slice(0, 2).toUpperCase()}
    </span>
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
  modules.splice(2, 1, [
    "Caja",
    "Cada usuario abre y cierra su propia caja; sin una sesión abierta no se puede confirmar una venta.",
    "Activo",
  ]);
  modules.push(
    [
      "Clientes",
      "Registra clientes con DNI, contacto y dirección o usa Cliente General para ventas rápidas.",
      "Activo",
    ],
    [
      "Proveedores",
      "Conserva RUC, contacto y datos de abastecimiento para las compras y entradas de inventario.",
      "Activo",
    ],
    [
      "Compras y lotes",
      "Recibe mercadería por factura, registra accesorios por cantidad y equipos por IMEI, con pago inmediato y trazabilidad de proveedor.",
      "Activo",
    ],
    [
      "Usuarios y sedes",
      "El superadministrador crea administradores; los administradores crean vendedores para cada almacén.",
      "Activo",
    ],
  );
  const benefits =
    role === "seller"
      ? [
          "Trabajas solo en el almacén que te fue asignado.",
          "La caja propia protege tus ventas y permite un cierre claro por turno.",
          "El sistema descuenta el stock al confirmar un pago completo.",
        ]
      : role === "admin"
        ? [
            "Puedes cambiar la sede operativa desde el menú lateral y revisar cada almacén.",
            "Puedes crear vendedores para cualquier sede, controlar inventario, ventas, caja y gastos.",
            "Puedes recibir lotes de proveedores y pagar desde caja de sede, caja central o tesorería.",
            "No puedes crear administradores ni cambiar privilegios de usuarios.",
          ]
        : [
            "Controlas usuarios, roles y la operación completa de todas las sedes.",
            "Puedes crear administradores y vendedores con su almacén asignado.",
            "Eres responsable de mantener los permisos y manuales actualizados.",
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
          <strong>Versión 1.1</strong>
          <small>Actualizado: 13 ago. 2026</small>
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
      <section className="manual-benefits">
        <p className="eyebrow">BENEFICIOS Y CONTROLES</p>
        <h3>Lo que este acceso te permite hacer</h3>
        <ul>{benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
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
