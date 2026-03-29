import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type RedeemReferralResult =
  | {
      ok: true;
      trial_days: number;
      trial_ends_at: string;
      referral_code_id: string;
    }
  | { ok: false; error: string; message: string };

export type CreateAffiliateCodeResult =
  | {
      ok: true;
      already_existed: boolean;
      code: string;
      trial_days: number;
      referral_code_id?: string;
    }
  | { ok: false; error: string };

const PROFILE_QUERY_KEY = ['supabase_profile'] as const;

function mapRedeemPayload(data: unknown): RedeemReferralResult {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'UNKNOWN', message: 'Respons tidak valid.' };
  }
  const o = data as Record<string, unknown>;
  if (o.ok === true) {
    return {
      ok: true,
      trial_days: Number(o.trial_days),
      trial_ends_at: String(o.trial_ends_at ?? ''),
      referral_code_id: String(o.referral_code_id ?? ''),
    };
  }
  return {
    ok: false,
    error: String(o.error ?? 'UNKNOWN'),
    message: String(o.message ?? 'Gagal menerapkan kode.'),
  };
}

/** Call after successful redeem or when creating affiliate code, to refresh SubscriptionContext + profile. */
export function invalidateReferralProfile(queryClient: QueryClient | null | undefined) {
  queryClient?.invalidateQueries({ queryKey: [...PROFILE_QUERY_KEY] });
}

export async function redeemReferralCode(
  rawCode: string,
  clientMeta?: Record<string, unknown>,
): Promise<RedeemReferralResult> {
  const { data, error } = await supabase.rpc('redeem_referral_code', {
    p_raw_code: rawCode,
    p_client_meta: clientMeta ?? null,
  });

  if (error) {
    return { ok: false, error: 'RPC_ERROR', message: error.message };
  }
  return mapRedeemPayload(data);
}

export async function createMyAffiliateCode(
  clientMeta?: Record<string, unknown>,
): Promise<CreateAffiliateCodeResult> {
  const { data, error } = await supabase.rpc('create_my_referral_code', {
    p_client_meta: clientMeta ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'INVALID_RESPONSE' };
  }
  const o = data as Record<string, unknown>;
  if (o.ok !== true) {
    return { ok: false, error: String(o.error ?? 'FAILED') };
  }
  return {
    ok: true,
    already_existed: Boolean(o.already_existed),
    code: String(o.code ?? ''),
    trial_days: Number(o.trial_days ?? 7),
    referral_code_id: o.referral_code_id != null ? String(o.referral_code_id) : undefined,
  };
}

export function redeemErrorMessageForUi(error: string, fallback: string): string {
  const map: Record<string, string> = {
    INVALID_CODE: 'Kode tidak valid atau tidak ditemukan.',
    INACTIVE: 'Kode ini tidak aktif.',
    EXPIRED: 'Kode sudah kedaluwarsa.',
    USAGE_LIMIT_REACHED: 'Kode ini sudah mencapai batas penggunaan.',
    OWN_CODE: 'Anda tidak bisa menggunakan kode sendiri.',
    ALREADY_REDEEMED: 'Akun ini sudah pernah menggunakan kode undangan.',
    HAS_ACTIVE_TRIAL: 'Anda sudah memiliki masa percobaan aktif.',
    HAS_ACTIVE_SUBSCRIPTION: 'Tidak bisa menggunakan kode saat langganan berbayar aktif.',
    ACTIVE_TRIAL_EXISTS: 'Anda sudah memiliki masa percobaan aktif.',
    PAID_SUBSCRIPTION_ACTIVE: 'Tidak bisa menggunakan kode saat langganan berbayar aktif.',
    NOT_AUTHENTICATED: 'Silakan masuk terlebih dahulu.',
    RPC_ERROR: fallback,
    INTERNAL_ERROR: 'Terjadi kesalahan. Silakan coba lagi.',
    RATE_LIMITED: 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.',
  };
  return map[error] ?? fallback;
}
