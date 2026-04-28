import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SERVICE_KEY?.trim() ||
  "";

const app = new Hono();

/**
 * Permanent account deletion (App Store 5.1.1(v)).
 * Verifies the caller's JWT, then deletes the auth user (CASCADE removes app rows).
 */
app.get("/health", async (c) => {
  return c.json({
    ok: true,
    route: "/api/account/delete",
    configured: {
      supabaseUrl: Boolean(supabaseUrl),
      supabaseAnonKey: Boolean(supabaseAnonKey),
      serviceRoleKey: Boolean(serviceKey),
    },
  });
});

app.post("/delete", async (c) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return c.json({ error: "Supabase URL/anon key not configured", code: "backend_not_configured" }, 503);
  }
  if (!serviceKey) {
    return c.json(
      {
        error:
          "Account deletion is not enabled on this server (missing SUPABASE_SERVICE_ROLE_KEY).",
        code: "account_deletion_disabled",
      },
      503
    );
  }

  let body: { accessToken?: string } | null = null;
  try {
    body = await c.req.json();
  } catch {
    body = null;
  }

  const authHeader = c.req.header("authorization") || c.req.header("Authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const bodyToken = typeof body?.accessToken === "string" ? body.accessToken.trim() : "";
  const token = bearerToken || bodyToken;

  if (!token) {
    return c.json({ error: "Missing access token", code: "missing_access_token" }, 400);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(token);

  if (userErr || !user?.id) {
    return c.json({ error: "Invalid or expired session", code: "invalid_or_expired_session" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);

  if (delErr) {
    return c.json({ error: delErr.message || "Failed to delete user", code: "delete_failed" }, 500);
  }

  return c.json({ ok: true, userId: user.id });
});

export default app;
