import { supabase } from '@/lib/supabase';

/** Matches app “premium” when subscription-sync has set ai_scan_quota_bypass.is_active (RevenueCat or allowlist). */
export async function fetchPremiumBypassUserIdSet(userIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(userIds.map((id) => id).filter(Boolean))];
  if (unique.length === 0) return new Set();

  const premium = new Set<string>();
  await Promise.all(
    unique.map(async (id) => {
      try {
        const { data, error } = await supabase.rpc('is_ai_scan_quota_bypass', { p_user_id: id });
        if (error) {
          console.warn('[communityPremium] bypass check failed', id, error.message);
          return;
        }
        if (data === true) premium.add(id);
      } catch (e) {
        console.warn('[communityPremium] bypass check exception', id, e);
      }
    }),
  );
  return premium;
}
