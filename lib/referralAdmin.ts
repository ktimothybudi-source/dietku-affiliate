import { supabase } from '@/lib/supabase';

export const ADMIN_REFERRAL_PAGE_SIZE = 40;

export type AdminCodesSort = 'newest' | 'most_used' | 'expiring';
export type AdminCodesFilterActive = 'all' | 'active' | 'inactive';
export type AdminCodesFilterExpired = 'all' | 'valid' | 'expired';
export type AdminCodesFilterTrial = 'all' | '7' | '30' | 'custom';

export type ReferralCodeWithStats = {
  id: string;
  code_normalized: string;
  owner_user_id: string;
  code_kind: string;
  trial_days: number;
  is_active: boolean;
  usage_limit: number | null;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  redemption_count: number;
  last_redeemed_at: string | null;
  remaining_uses: number | null;
};

export type ReferralRedemptionRow = {
  id: string;
  referral_code_id: string;
  redeemer_user_id: string;
  trial_days_granted: number;
  trial_ends_at: string;
  redeemed_at: string;
};

export type ReferralAttemptRow = {
  id: number;
  actor_user_id: string | null;
  raw_input: string | null;
  normalized_code: string | null;
  outcome: string;
  error_code: string | null;
  created_at: string;
};

export type ReferralAuditRow = {
  id: number;
  admin_user_id: string | null;
  action: string;
  referral_code_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
};

/** Server-side filters + sort + range; use for admin list pagination. */
export async function fetchAdminReferralCodesPage(params: {
  offset: number;
  limit: number;
  sortKey: AdminCodesSort;
  search: string;
  fActive: AdminCodesFilterActive;
  fExpired: AdminCodesFilterExpired;
  fTrial: AdminCodesFilterTrial;
}): Promise<{ rows: ReferralCodeWithStats[]; total: number }> {
  const nowIso = new Date().toISOString();
  let q = supabase.from('referral_codes_with_stats').select('*', { count: 'exact' });

  const s = params.search.trim();
  if (s) q = q.ilike('code_normalized', `%${s}%`);

  if (params.fActive === 'active') q = q.eq('is_active', true);
  if (params.fActive === 'inactive') q = q.eq('is_active', false);

  if (params.fExpired === 'expired') {
    q = q.not('expires_at', 'is', null).lt('expires_at', nowIso);
  }
  if (params.fExpired === 'valid') {
    // PostgREST: quote timestamp so colons in ISO string do not break the or() parser.
    q = q.or(`expires_at.is.null,expires_at.gte."${nowIso}"`);
  }

  if (params.fTrial === '7') q = q.eq('trial_days', 7);
  if (params.fTrial === '30') q = q.eq('trial_days', 30);
  if (params.fTrial === 'custom') {
    q = q.neq('trial_days', 7).neq('trial_days', 30);
  }

  switch (params.sortKey) {
    case 'newest':
      q = q.order('created_at', { ascending: false });
      break;
    case 'most_used':
      q = q.order('redemption_count', { ascending: false });
      break;
    case 'expiring':
      q = q.order('expires_at', { ascending: true, nullsFirst: false });
      break;
  }

  const from = params.offset;
  const to = params.offset + params.limit - 1;
  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as ReferralCodeWithStats[], total: count ?? 0 };
}

export async function fetchRedemptionsForCode(codeId: string): Promise<ReferralRedemptionRow[]> {
  const { data, error } = await supabase
    .from('referral_redemptions')
    .select('id, referral_code_id, redeemer_user_id, trial_days_granted, trial_ends_at, redeemed_at')
    .eq('referral_code_id', codeId)
    .order('redeemed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReferralRedemptionRow[];
}

export async function fetchRecentAttemptsForCode(
  normalizedCode: string,
  limit = 40,
): Promise<ReferralAttemptRow[]> {
  const { data, error } = await supabase
    .from('referral_attempt_logs')
    .select('id, actor_user_id, raw_input, normalized_code, outcome, error_code, created_at')
    .eq('normalized_code', normalizedCode)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ReferralAttemptRow[];
}

export async function fetchReferralAudit(limit = 80): Promise<ReferralAuditRow[]> {
  const { data, error } = await supabase
    .from('referral_admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ReferralAuditRow[];
}

export async function adminCreateReferralCode(params: {
  code: string;
  ownerUserId: string;
  trialDays: number;
  usageLimit?: number | null;
  expiresAt?: string | null;
  codeKind?: 'affiliate' | 'promo';
  isActive?: boolean;
}): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('admin_create_referral_code', {
    p_code: params.code,
    p_owner_user_id: params.ownerUserId,
    p_trial_days: params.trialDays,
    p_usage_limit: params.usageLimit ?? null,
    p_expires_at: params.expiresAt ?? null,
    p_code_kind: params.codeKind ?? 'promo',
    p_is_active: params.isActive ?? true,
  });
  if (error) return { ok: false, error: error.message };
  const o = data as Record<string, unknown> | null;
  if (!o || o.ok !== true) return { ok: false, error: String(o?.error ?? 'FAILED') };
  return { ok: true, code: String(o.code ?? '') };
}

export async function adminPatchReferralCode(params: {
  id: string;
  trialDays: number;
  usageLimit: number | null;
  expiresAt: string | null;
  isActive: boolean;
  ownerUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('admin_patch_referral_code', {
    p_id: params.id,
    p_trial_days: params.trialDays,
    p_usage_limit: params.usageLimit,
    p_expires_at: params.expiresAt,
    p_is_active: params.isActive,
    p_owner_user_id: params.ownerUserId,
  });
  if (error) return { ok: false, error: error.message };
  const o = data as Record<string, unknown> | null;
  if (!o || o.ok !== true) return { ok: false, error: String(o?.error ?? 'FAILED') };
  return { ok: true };
}
