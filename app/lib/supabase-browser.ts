"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function getSupabaseBrowser() {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  client = url && key && !url.includes("TU-PROYECTO") && !key.startsWith("TU_")
    ? createClient(url, key)
    : null;
  return client;
}

export function createSupabaseAuthClient(remember: boolean) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || url.includes("TU-PROYECTO") || key.startsWith("TU_")) return null;
  return createClient(url, key, { auth: { persistSession: remember, autoRefreshToken: remember } });
}
