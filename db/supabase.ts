import { createClient } from "@supabase/supabase-js";

function required(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY") {
  const value = process.env[name];
  if (!value || value.startsWith("TU_")) {
    throw new Error(`Falta configurar ${name} en .env.local.`);
  }
  return value;
}

/**
 * Cliente exclusivo del servidor. La service role omite RLS para que las
 * comprobaciones de rol se hagan en las rutas de THOR; nunca se importa desde
 * componentes de navegador.
 */
export function getSupabaseAdmin() {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
