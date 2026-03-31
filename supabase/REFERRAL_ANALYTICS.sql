-- Referral analytics (run in Supabase SQL editor as service_role / postgres).
-- Adjust date filters as needed.
--
-- Rate limiting: redeem_referral_code enforces a sliding window on referral_attempt_logs
-- (see migration 20260330_referral_redeem_rate_limit.sql — default 24 attempts / 15 min / user).
-- Rows are not written when RATE_LIMITED is returned, so the limit does not self-amplify.

-- Total redemptions per code
SELECT
  c.code_normalized,
  c.trial_days,
  c.is_active,
  c.usage_limit,
  COUNT(r.id) AS redemption_count
FROM public.referral_codes c
LEFT JOIN public.referral_redemptions r ON r.referral_code_id = c.id
GROUP BY c.id, c.code_normalized, c.trial_days, c.is_active, c.usage_limit
ORDER BY redemption_count DESC;

-- Top code owners by successful redemptions
SELECT
  c.owner_user_id,
  p.email,
  COUNT(r.id) AS total_redemptions
FROM public.referral_codes c
JOIN public.referral_redemptions r ON r.referral_code_id = c.id
LEFT JOIN public.profiles p ON p.id = c.owner_user_id
GROUP BY c.owner_user_id, p.email
ORDER BY total_redemptions DESC
LIMIT 50;

-- Daily redemption count
SELECT date_trunc('day', redeemed_at) AS day, COUNT(*) AS cnt
FROM public.referral_redemptions
GROUP BY 1
ORDER BY 1 DESC;

-- Trials granted by length (e.g. 7 vs 30 days)
SELECT trial_days_granted, COUNT(*) AS users
FROM public.referral_redemptions
GROUP BY trial_days_granted
ORDER BY trial_days_granted;

-- Failed attempts (fraud / UX monitoring)
SELECT error_code, outcome, COUNT(*) AS cnt
FROM public.referral_attempt_logs
WHERE outcome = 'failure'
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY error_code, outcome
ORDER BY cnt DESC;

-- Conversion starter: redemptions vs users with profile (ill-advised if no funnel table)
-- SELECT
--   (SELECT COUNT(DISTINCT redeemer_user_id) FROM public.referral_redemptions) AS referred_users,
--   (SELECT COUNT(*) FROM public.profiles) AS profiles_total;

-- ---------------------------------------------------------------------------
-- Admin dashboard (authenticated as admin; RLS allows full reads)
-- ---------------------------------------------------------------------------

-- Codes with redemption_count / remaining_uses / last_redeemed (same as view)
-- SELECT * FROM public.referral_codes_with_stats ORDER BY created_at DESC;

-- Top codes by redemptions
SELECT
  code_normalized,
  trial_days,
  is_active,
  redemption_count,
  last_redeemed_at
FROM public.referral_codes_with_stats
ORDER BY redemption_count DESC
LIMIT 25;

-- Top creators (owners) by total successful redemptions across their codes
SELECT
  s.owner_user_id,
  p.email,
  p.name,
  SUM(s.redemption_count)::BIGINT AS total_redemptions
FROM public.referral_codes_with_stats s
LEFT JOIN public.profiles p ON p.id = s.owner_user_id
GROUP BY s.owner_user_id, p.email, p.name
ORDER BY total_redemptions DESC
LIMIT 25;

-- ---------------------------------------------------------------------------
-- Creator / admin performance queries (new role model)
-- ---------------------------------------------------------------------------

-- Top creators by completed signups
SELECT
  creator_user_id,
  name,
  email,
  signups
FROM public.creator_performance
ORDER BY signups DESC
LIMIT 25;

-- Top creators by completed subscriptions
SELECT
  creator_user_id,
  name,
  email,
  subscriptions
FROM public.creator_performance
ORDER BY subscriptions DESC
LIMIT 25;

-- Creator conversion rate
SELECT
  creator_user_id,
  name,
  email,
  validations,
  subscriptions,
  conversion_rate_pct
FROM public.creator_performance
ORDER BY conversion_rate_pct DESC, subscriptions DESC
LIMIT 50;

-- Creator daily referral performance
SELECT
  creator_user_id,
  referral_code_id,
  day,
  entries,
  successful_validations,
  completed_signups,
  completed_subscriptions,
  failed_claims
FROM public.creator_daily_referral_performance
ORDER BY day DESC, creator_user_id
LIMIT 500;

-- Admin global stats across creators and promo codes
SELECT *
FROM public.admin_referral_global_stats;

-- Admin audit trail
SELECT *
FROM public.referral_admin_audit_log
ORDER BY created_at DESC
LIMIT 100;

-- Materialized view (optional refresh nightly): daily redemptions
-- CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_referral_redemptions_daily AS
-- SELECT date_trunc('day', redeemed_at)::date AS day, COUNT(*) AS cnt
-- FROM public.referral_redemptions
-- GROUP BY 1;
-- CREATE UNIQUE INDEX ON public.mv_referral_redemptions_daily (day);
-- REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_referral_redemptions_daily;
