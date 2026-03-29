import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'dietku_pending_referral_code';

export async function stashPendingReferralCode(raw: string): Promise<void> {
  const t = raw.trim();
  if (!t) return;
  await AsyncStorage.setItem(STORAGE_KEY, t);
}

/** Returns stored code and clears it (one-shot for apply on paywall). */
export async function consumePendingReferralCode(): Promise<string | null> {
  const v = await AsyncStorage.getItem(STORAGE_KEY);
  if (v) await AsyncStorage.removeItem(STORAGE_KEY);
  return v?.trim() || null;
}

export async function peekPendingReferralCode(): Promise<string | null> {
  const v = await AsyncStorage.getItem(STORAGE_KEY);
  return v?.trim() || null;
}
