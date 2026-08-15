"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;
let temporaryAuthClient: SupabaseClient | null | undefined;

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return url && key && !url.includes("TU-PROYECTO") && !key.startsWith("TU_")
    ? { url, key }
    : null;
}

export function getSupabaseBrowser() {
  if (client !== undefined) return client;
  const config = getSupabaseConfig();
  client = config ? createClient(config.url, config.key) : null;
  return client;
}

export function createSupabaseAuthClient(remember: boolean) {
  if (remember) return getSupabaseBrowser();
  if (temporaryAuthClient !== undefined) return temporaryAuthClient;
  const config = getSupabaseConfig();
  temporaryAuthClient = config
    ? createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, storageKey: "thor-temporary-auth" } })
    : null;
  return temporaryAuthClient;
}
