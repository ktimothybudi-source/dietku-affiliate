-- Run once in Supabase SQL Editor (optional).
-- Enables unlimited AI meal-scan quota for a user by email.
-- The app also syncs this via /api/ai/subscription-sync when EXPO_PUBLIC_PREMIUM_EMAIL_ALLOWLIST matches.

INSERT INTO public.ai_scan_quota_bypass (user_id, is_active, note)
SELECT id, TRUE, 'manual:sql-grant'
FROM auth.users
WHERE lower(email) = lower('k.timothybudi@gmail.com')
ON CONFLICT (user_id) DO UPDATE SET
  is_active = TRUE,
  note = 'manual:sql-grant',
  updated_at = NOW();
