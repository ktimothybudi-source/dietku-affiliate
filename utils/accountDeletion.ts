import { supabase } from '@/lib/supabase';

function getApiBaseUrl(): string {
  return (
    process.env.EXPO_PUBLIC_API_BASE_URL ||
    process.env.EXPO_PUBLIC_RORK_API_BASE_URL ||
    'https://dietku.onrender.com'
  );
}

export type AccountDeletionResult =
  | { ok: true }
  | { ok: false; error: string; status?: number; code?: string };

type AccessTokenResult =
  | { ok: true; token: string }
  | { ok: false; error: string; code: string };

const DELETE_TIMEOUT_MS = 15000;

async function getFreshAccessToken(): Promise<AccessTokenResult> {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) return { ok: false, error: error.message, code: 'session_unavailable' };
    if (!session?.access_token) return { ok: false, error: 'not_signed_in', code: 'not_signed_in' };

    const nowSec = Math.floor(Date.now() / 1000);
    const exp = session.expires_at ?? 0;
    const needsRefresh = exp > 0 && exp <= nowSec + 30;
    if (!needsRefresh) return { ok: true, token: session.access_token };

    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) return { ok: false, error: refreshErr.message, code: 'refresh_failed' };
    if (!refreshed.session?.access_token) return { ok: false, error: 'not_signed_in', code: 'not_signed_in' };
    return { ok: true, token: refreshed.session.access_token };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: 'session_exception',
    };
  }
}

async function callDeleteEndpointUrl(accessToken: string, url: string): Promise<AccountDeletionResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DELETE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ accessToken }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    const msg = e instanceof Error ? e.message : String(e);
    const code = msg.toLowerCase().includes('aborted') ? 'timeout' : 'network_error';
    return { ok: false, error: msg, code };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let message = response.statusText || 'Request failed';
    let code = 'request_failed';
    try {
      const j = (await response.json()) as { error?: string; code?: string };
      if (j?.error) message = j.error;
      if (j?.code) code = j.code;
    } catch {
      try {
        const t = await response.text();
        if (t) message = t.slice(0, 300);
      } catch {
        // keep message
      }
    }
    console.warn('[deleteAccountViaBackend] failed', {
      status: response.status,
      url,
      code,
      message: String(message).slice(0, 240),
    });
    if (response.status === 404 && code === 'request_failed') {
      code = 'backend_route_not_found';
      message = 'Account deletion endpoint is not available on this server.';
    }
    return { ok: false, error: message, status: response.status, code };
  }

  return { ok: true };
}

async function callDeleteEndpoint(accessToken: string): Promise<AccountDeletionResult> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const primaryUrl = `${base}/api/account/delete`;
  const primary = await callDeleteEndpointUrl(accessToken, primaryUrl);
  if (primary.ok || primary.status !== 404) return primary;

  // Backward-compatible fallback for deployments that mounted account routes without /api prefix.
  const fallbackUrl = `${base}/account/delete`;
  return callDeleteEndpointUrl(accessToken, fallbackUrl);
}

/**
 * Deletes the signed-in user via backend (Supabase Admin API).
 * Requires `SUPABASE_SERVICE_ROLE_KEY` on the API server.
 */
export async function deleteAccountViaBackend(): Promise<AccountDeletionResult> {
  const tokenResult = await getFreshAccessToken();
  if (!tokenResult.ok) {
    return { ok: false, error: tokenResult.error, code: tokenResult.code };
  }

  const firstTry = await callDeleteEndpoint(tokenResult.token);
  if (firstTry.ok) return firstTry;

  const shouldRetryWithRefresh = firstTry.status === 401 || firstTry.code === 'invalid_or_expired_session';
  if (!shouldRetryWithRefresh) return firstTry;

  const refreshedToken = await getFreshAccessToken();
  if (!refreshedToken.ok) {
    return {
      ok: false,
      error: refreshedToken.error,
      code: refreshedToken.code,
      status: 401,
    };
  }

  return callDeleteEndpoint(refreshedToken.token);
}
