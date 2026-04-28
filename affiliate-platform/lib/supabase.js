import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn("Supabase env vars are not configured yet.");
}

export const supabaseClient = createClient(supabaseUrl || "", supabaseAnonKey || "");

export const supabaseAdmin = createClient(supabaseUrl || "", serviceRoleKey || "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
