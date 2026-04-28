import { createClient } from "@supabase/supabase-js";

function requireEnv(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : "");
  if (!value) {
    throw new Error(
      fallbackName
        ? `Missing env var: ${name} (or ${fallbackName})`
        : `Missing env var: ${name}`,
    );
  }
  return value;
}

export function getSupabaseClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "EXPO_PUBLIC_SUPABASE_ANON_KEY"),
  );
}

export function getSupabaseAdmin() {
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!serviceRoleKey) {
    throw new Error("Missing env var: SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"),
    serviceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
