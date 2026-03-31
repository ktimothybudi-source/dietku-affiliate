import { supabase } from '@/lib/supabase';

export type CreatorDashboard = {
  ok: true;
  creator_user_id: string;
  overview: {
    current_active_code: string | null;
    code_status: boolean;
    reward: string;
    created_at: string | null;
    last_used_at: string | null;
    total_signups: number;
    total_subscriptions: number;
    conversion_rate_pct: number;
  };
  stats: {
    total_code_entries: number;
    total_successful_validations: number;
    total_completed_signups: number;
    total_completed_subscriptions: number;
    total_pending_claims: number;
    total_failed_claims: number;
    active_code_status: boolean;
    current_code_value: string | null;
    created_at: string | null;
    last_used_at: string | null;
  };
  daily_trend: Array<{
    day: string;
    entries: number;
    successful_validations: number;
    completed_signups: number;
    completed_subscriptions: number;
    failed_claims: number;
  }>;
};

export type CreatorHistoryRow = {
  redemption_date: string;
  status: string;
  trial_unlocked: boolean;
  subscription_completed: boolean;
  user_masked: string;
};

export async function creatorEnsurePrimaryCode(): Promise<
  { ok: true; code: string; is_active: boolean; trial_days: number; created_at: string | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('creator_get_or_create_primary_code');
  if (error) return { ok: false, error: error.message };
  const o = (data ?? {}) as Record<string, unknown>;
  if (o.ok !== true) return { ok: false, error: String(o.error ?? 'FAILED') };
  return {
    ok: true,
    code: String(o.code ?? ''),
    is_active: Boolean(o.is_active),
    trial_days: Number(o.trial_days ?? 7),
    created_at: o.created_at ? String(o.created_at) : null,
  };
}

export async function creatorSetCodeActive(codeId: string, isActive: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('creator_set_code_active', {
    p_code_id: codeId,
    p_is_active: isActive,
  });
  if (error) return { ok: false, error: error.message };
  const o = (data ?? {}) as Record<string, unknown>;
  if (o.ok !== true) return { ok: false, error: String(o.error ?? 'FAILED') };
  return { ok: true };
}

export async function fetchCreatorDashboard(creatorUserId?: string | null): Promise<CreatorDashboard | null> {
  const { data, error } = await supabase.rpc('creator_get_dashboard', {
    p_creator_user_id: creatorUserId ?? null,
  });
  if (error) throw error;
  const o = (data ?? null) as Record<string, unknown> | null;
  if (!o || o.ok !== true) return null;
  return o as unknown as CreatorDashboard;
}

export async function fetchCreatorHistory(
  creatorUserId?: string | null,
  limit = 60,
): Promise<CreatorHistoryRow[]> {
  const { data, error } = await supabase.rpc('creator_get_history', {
    p_creator_user_id: creatorUserId ?? null,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as CreatorHistoryRow[];
}

export async function fetchCreatorOwnedCode(creatorUserId: string): Promise<{ id: string; is_active: boolean } | null> {
  const { data, error } = await supabase
    .from('referral_codes')
    .select('id,is_active')
    .eq('owner_user_id', creatorUserId)
    .eq('code_type', 'creator_standard')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; is_active: boolean } | null) ?? null;
}
