-- Creator role + creator referral dashboards + admin global visibility
-- Depends on prior referral migrations (20260329_*)

-- 1) Roles: user, creator, admin
ALTER TABLE public.profiles
  ALTER COLUMN app_role SET DEFAULT 'user';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_app_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_app_role_check
  CHECK (app_role IN ('user', 'creator', 'admin'));

-- 2) Code typing: creator-standard (fixed 7 days) vs admin promo
ALTER TABLE public.referral_codes
  ADD COLUMN IF NOT EXISTS code_type TEXT;

UPDATE public.referral_codes
SET code_type = CASE
  WHEN code_kind = 'promo' THEN 'admin_promo'
  ELSE 'creator_standard'
END
WHERE code_type IS NULL;

ALTER TABLE public.referral_codes
  ALTER COLUMN code_type SET DEFAULT 'creator_standard',
  ALTER COLUMN code_type SET NOT NULL;

ALTER TABLE public.referral_codes
  DROP CONSTRAINT IF EXISTS referral_codes_code_type_check;

ALTER TABLE public.referral_codes
  ADD CONSTRAINT referral_codes_code_type_check
  CHECK (code_type IN ('creator_standard', 'admin_promo'));

CREATE INDEX IF NOT EXISTS referral_codes_owner_type_idx
  ON public.referral_codes (owner_user_id, code_type, is_active);

-- Enforce creator-standard invariants in database layer.
CREATE OR REPLACE FUNCTION public.referral_codes_enforce_creator_standard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.code_type = 'creator_standard' THEN
    NEW.trial_days := 7;
    NEW.code_kind := 'affiliate';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_codes_enforce_creator_standard ON public.referral_codes;
CREATE TRIGGER trg_referral_codes_enforce_creator_standard
  BEFORE INSERT OR UPDATE ON public.referral_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.referral_codes_enforce_creator_standard();

-- 3) Role helpers
CREATE OR REPLACE FUNCTION public.is_app_creator(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_uid
      AND p.app_role IN ('creator', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_creator(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_creator(UUID) TO authenticated;

-- 4) Optional conversion funnel events (signup / subscription completion)
CREATE TABLE IF NOT EXISTS public.referral_conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('signup_completed', 'subscription_completed')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  CONSTRAINT referral_conversion_events_unique UNIQUE (referral_code_id, referred_user_id, event_type)
);

CREATE INDEX IF NOT EXISTS referral_conversion_events_code_idx
  ON public.referral_conversion_events (referral_code_id, event_type, event_at DESC);

CREATE INDEX IF NOT EXISTS referral_conversion_events_user_idx
  ON public.referral_conversion_events (referred_user_id, event_at DESC);

ALTER TABLE public.referral_conversion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_conversion_events_owner_or_admin ON public.referral_conversion_events;
CREATE POLICY referral_conversion_events_owner_or_admin
  ON public.referral_conversion_events
  FOR SELECT
  USING (
    public.is_app_admin()
    OR EXISTS (
      SELECT 1
      FROM public.referral_codes c
      WHERE c.id = referral_conversion_events.referral_code_id
        AND c.owner_user_id = auth.uid()
    )
  );

-- No direct writes for authenticated clients; backend/service role should write this.

-- 5) Creator metrics views
CREATE OR REPLACE VIEW public.creator_code_metrics AS
SELECT
  c.id AS referral_code_id,
  c.owner_user_id AS creator_user_id,
  c.code_normalized AS current_code_value,
  c.code_type,
  c.is_active AS active_code_status,
  c.created_at,
  (
    SELECT MAX(x.ts)
    FROM (
      SELECT MAX(r.redeemed_at) AS ts
      FROM public.referral_redemptions r
      WHERE r.referral_code_id = c.id
      UNION ALL
      SELECT MAX(a.created_at) AS ts
      FROM public.referral_attempt_logs a
      WHERE a.normalized_code = c.code_normalized
    ) x
  ) AS last_used_at,
  (
    SELECT COUNT(*)::INT
    FROM public.referral_attempt_logs a
    WHERE a.normalized_code = c.code_normalized
  ) AS total_code_entries,
  (
    SELECT COUNT(*)::INT
    FROM public.referral_redemptions r
    WHERE r.referral_code_id = c.id
  ) AS total_successful_validations,
  (
    SELECT COUNT(DISTINCT e.referred_user_id)::INT
    FROM public.referral_conversion_events e
    WHERE e.referral_code_id = c.id
      AND e.event_type = 'signup_completed'
  ) AS total_completed_signups,
  (
    SELECT COUNT(DISTINCT e.referred_user_id)::INT
    FROM public.referral_conversion_events e
    WHERE e.referral_code_id = c.id
      AND e.event_type = 'subscription_completed'
  ) AS total_completed_subscriptions,
  (
    SELECT COUNT(*)::INT
    FROM public.referral_attempt_logs a
    WHERE a.normalized_code = c.code_normalized
      AND a.outcome = 'failure'
  ) AS total_failed_claims
FROM public.referral_codes c
WHERE c.code_type = 'creator_standard';

GRANT SELECT ON public.creator_code_metrics TO authenticated;

CREATE OR REPLACE VIEW public.creator_code_metrics_enriched AS
SELECT
  m.*,
  GREATEST(m.total_successful_validations - m.total_completed_signups, 0) AS total_pending_claims,
  CASE
    WHEN m.total_successful_validations = 0 THEN 0::NUMERIC
    ELSE ROUND((m.total_completed_subscriptions::NUMERIC / m.total_successful_validations::NUMERIC) * 100, 2)
  END AS conversion_rate_pct
FROM public.creator_code_metrics m;

GRANT SELECT ON public.creator_code_metrics_enriched TO authenticated;

CREATE OR REPLACE VIEW public.creator_daily_referral_performance AS
WITH attempt AS (
  SELECT
    c.owner_user_id AS creator_user_id,
    c.id AS referral_code_id,
    date_trunc('day', a.created_at)::date AS day,
    COUNT(*)::INT AS entries,
    COUNT(*) FILTER (WHERE a.outcome = 'failure')::INT AS failed_claims
  FROM public.referral_codes c
  LEFT JOIN public.referral_attempt_logs a
    ON a.normalized_code = c.code_normalized
  WHERE c.code_type = 'creator_standard'
  GROUP BY c.owner_user_id, c.id, date_trunc('day', a.created_at)::date
),
red AS (
  SELECT
    c.owner_user_id AS creator_user_id,
    r.referral_code_id,
    date_trunc('day', r.redeemed_at)::date AS day,
    COUNT(*)::INT AS successful_validations
  FROM public.referral_redemptions r
  JOIN public.referral_codes c ON c.id = r.referral_code_id
  WHERE c.code_type = 'creator_standard'
  GROUP BY c.owner_user_id, r.referral_code_id, date_trunc('day', r.redeemed_at)::date
),
evt AS (
  SELECT
    c.owner_user_id AS creator_user_id,
    e.referral_code_id,
    date_trunc('day', e.event_at)::date AS day,
    COUNT(*) FILTER (WHERE e.event_type = 'signup_completed')::INT AS completed_signups,
    COUNT(*) FILTER (WHERE e.event_type = 'subscription_completed')::INT AS completed_subscriptions
  FROM public.referral_conversion_events e
  JOIN public.referral_codes c ON c.id = e.referral_code_id
  WHERE c.code_type = 'creator_standard'
  GROUP BY c.owner_user_id, e.referral_code_id, date_trunc('day', e.event_at)::date
),
days AS (
  SELECT creator_user_id, referral_code_id, day FROM attempt
  UNION
  SELECT creator_user_id, referral_code_id, day FROM red
  UNION
  SELECT creator_user_id, referral_code_id, day FROM evt
)
SELECT
  d.creator_user_id,
  d.referral_code_id,
  d.day,
  COALESCE(a.entries, 0) AS entries,
  COALESCE(r.successful_validations, 0) AS successful_validations,
  COALESCE(e.completed_signups, 0) AS completed_signups,
  COALESCE(e.completed_subscriptions, 0) AS completed_subscriptions,
  COALESCE(a.failed_claims, 0) AS failed_claims
FROM days d
LEFT JOIN attempt a
  ON a.creator_user_id = d.creator_user_id AND a.referral_code_id = d.referral_code_id AND a.day = d.day
LEFT JOIN red r
  ON r.creator_user_id = d.creator_user_id AND r.referral_code_id = d.referral_code_id AND r.day = d.day
LEFT JOIN evt e
  ON e.creator_user_id = d.creator_user_id AND e.referral_code_id = d.referral_code_id AND e.day = d.day;

GRANT SELECT ON public.creator_daily_referral_performance TO authenticated;

CREATE OR REPLACE VIEW public.creator_performance AS
SELECT
  m.creator_user_id,
  p.name,
  p.email,
  SUM(m.total_completed_signups)::INT AS signups,
  SUM(m.total_completed_subscriptions)::INT AS subscriptions,
  SUM(m.total_successful_validations)::INT AS validations,
  CASE
    WHEN SUM(m.total_successful_validations) = 0 THEN 0::NUMERIC
    ELSE ROUND((SUM(m.total_completed_subscriptions)::NUMERIC / SUM(m.total_successful_validations)::NUMERIC) * 100, 2)
  END AS conversion_rate_pct
FROM public.creator_code_metrics_enriched m
LEFT JOIN public.profiles p ON p.id = m.creator_user_id
GROUP BY m.creator_user_id, p.name, p.email;

GRANT SELECT ON public.creator_performance TO authenticated;

CREATE OR REPLACE VIEW public.admin_referral_global_stats AS
SELECT
  COUNT(DISTINCT creator_user_id)::INT AS total_creators,
  COUNT(*)::INT AS total_creator_codes,
  SUM(total_code_entries)::INT AS total_entries,
  SUM(total_successful_validations)::INT AS total_validations,
  SUM(total_completed_signups)::INT AS total_signups,
  SUM(total_completed_subscriptions)::INT AS total_subscriptions,
  SUM(total_pending_claims)::INT AS total_pending_claims,
  SUM(total_failed_claims)::INT AS total_failed_claims
FROM public.creator_code_metrics_enriched;

GRANT SELECT ON public.admin_referral_global_stats TO authenticated;

-- 6) Creator-facing RPCs (secure ownership checks)
CREATE OR REPLACE FUNCTION public.creator_get_or_create_primary_code()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
  v_existing public.referral_codes%ROWTYPE;
  v_code TEXT;
  v_try INT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  SELECT app_role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role NOT IN ('creator', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_existing
  FROM public.referral_codes
  WHERE owner_user_id = v_uid
    AND code_type = 'creator_standard'
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_existed', true,
      'id', v_existing.id,
      'code', v_existing.code_normalized,
      'trial_days', v_existing.trial_days,
      'is_active', v_existing.is_active,
      'created_at', v_existing.created_at
    );
  END IF;

  FOR v_try IN 1..40 LOOP
    v_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8));
    BEGIN
      INSERT INTO public.referral_codes (
        code_normalized,
        owner_user_id,
        code_kind,
        code_type,
        trial_days,
        is_active,
        usage_limit,
        expires_at,
        created_by
      )
      VALUES (v_code, v_uid, 'affiliate', 'creator_standard', 7, TRUE, NULL, NULL, v_uid)
      RETURNING * INTO v_existing;

      RETURN jsonb_build_object(
        'ok', true,
        'already_existed', false,
        'id', v_existing.id,
        'code', v_existing.code_normalized,
        'trial_days', v_existing.trial_days,
        'is_active', v_existing.is_active,
        'created_at', v_existing.created_at
      );
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', false, 'error', 'CODE_GENERATION_FAILED');
END;
$$;

REVOKE ALL ON FUNCTION public.creator_get_or_create_primary_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_get_or_create_primary_code() TO authenticated;

CREATE OR REPLACE FUNCTION public.creator_set_code_active(
  p_code_id UUID,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.referral_codes%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  END IF;
  IF NOT public.is_app_creator(v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_row
  FROM public.referral_codes
  WHERE id = p_code_id
    AND code_type = 'creator_standard'
    AND owner_user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;

  UPDATE public.referral_codes
  SET is_active = p_is_active
  WHERE id = p_code_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.creator_set_code_active(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_set_code_active(UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.creator_get_dashboard(
  p_creator_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_target UUID := COALESCE(p_creator_user_id, auth.uid());
  v_is_admin BOOLEAN;
  v_role TEXT;
  v_code RECORD;
  v_metrics RECORD;
  v_trend JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  SELECT public.is_app_admin() INTO v_is_admin;
  SELECT app_role INTO v_role FROM public.profiles WHERE id = v_uid;

  IF NOT (v_is_admin OR (v_uid = v_target AND v_role IN ('creator', 'admin'))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT *
  INTO v_code
  FROM public.referral_codes c
  WHERE c.owner_user_id = v_target
    AND c.code_type = 'creator_standard'
  ORDER BY c.is_active DESC, c.created_at DESC
  LIMIT 1;

  SELECT
    COALESCE(SUM(total_code_entries), 0)::INT AS total_code_entries,
    COALESCE(SUM(total_successful_validations), 0)::INT AS total_successful_validations,
    COALESCE(SUM(total_completed_signups), 0)::INT AS total_completed_signups,
    COALESCE(SUM(total_completed_subscriptions), 0)::INT AS total_completed_subscriptions,
    COALESCE(SUM(total_pending_claims), 0)::INT AS total_pending_claims,
    COALESCE(SUM(total_failed_claims), 0)::INT AS total_failed_claims,
    MAX(last_used_at) AS last_used_at,
    CASE
      WHEN COALESCE(SUM(total_successful_validations), 0) = 0 THEN 0::NUMERIC
      ELSE ROUND((COALESCE(SUM(total_completed_subscriptions), 0)::NUMERIC / COALESCE(SUM(total_successful_validations), 0)::NUMERIC) * 100, 2)
    END AS conversion_rate_pct
  INTO v_metrics
  FROM public.creator_code_metrics_enriched
  WHERE creator_user_id = v_target;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'day', t.day,
        'entries', t.entries,
        'successful_validations', t.successful_validations,
        'completed_signups', t.completed_signups,
        'completed_subscriptions', t.completed_subscriptions,
        'failed_claims', t.failed_claims
      )
      ORDER BY t.day
    ),
    '[]'::jsonb
  )
  INTO v_trend
  FROM public.creator_daily_referral_performance t
  WHERE t.creator_user_id = v_target
    AND t.day >= (CURRENT_DATE - INTERVAL '14 days');

  RETURN jsonb_build_object(
    'ok', true,
    'creator_user_id', v_target,
    'overview', jsonb_build_object(
      'current_active_code', COALESCE(v_code.code_normalized, NULL),
      'code_status', COALESCE(v_code.is_active, false),
      'reward', '7-day free trial',
      'created_at', COALESCE(v_code.created_at, NULL),
      'last_used_at', COALESCE(v_metrics.last_used_at, NULL),
      'total_signups', COALESCE(v_metrics.total_completed_signups, 0),
      'total_subscriptions', COALESCE(v_metrics.total_completed_subscriptions, 0),
      'conversion_rate_pct', COALESCE(v_metrics.conversion_rate_pct, 0)
    ),
    'stats', jsonb_build_object(
      'total_code_entries', COALESCE(v_metrics.total_code_entries, 0),
      'total_successful_validations', COALESCE(v_metrics.total_successful_validations, 0),
      'total_completed_signups', COALESCE(v_metrics.total_completed_signups, 0),
      'total_completed_subscriptions', COALESCE(v_metrics.total_completed_subscriptions, 0),
      'total_pending_claims', COALESCE(v_metrics.total_pending_claims, 0),
      'total_failed_claims', COALESCE(v_metrics.total_failed_claims, 0),
      'active_code_status', COALESCE(v_code.is_active, false),
      'current_code_value', COALESCE(v_code.code_normalized, NULL),
      'created_at', COALESCE(v_code.created_at, NULL),
      'last_used_at', COALESCE(v_metrics.last_used_at, NULL)
    ),
    'daily_trend', v_trend
  );
END;
$$;

REVOKE ALL ON FUNCTION public.creator_get_dashboard(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_get_dashboard(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.creator_get_history(
  p_creator_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  redemption_date TIMESTAMPTZ,
  status TEXT,
  trial_unlocked BOOLEAN,
  subscription_completed BOOLEAN,
  user_masked TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_target UUID := COALESCE(p_creator_user_id, auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  IF NOT (public.is_app_admin() OR (public.is_app_creator(v_uid) AND v_uid = v_target)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  SELECT
    r.redeemed_at AS redemption_date,
    CASE
      WHEN s.referred_user_id IS NOT NULL THEN 'subscription_completed'
      WHEN g.referred_user_id IS NOT NULL THEN 'signup_completed'
      ELSE 'pending'
    END AS status,
    TRUE AS trial_unlocked,
    (s.referred_user_id IS NOT NULL) AS subscription_completed,
    LEFT(r.redeemer_user_id::TEXT, 8) || '****' AS user_masked
  FROM public.referral_redemptions r
  JOIN public.referral_codes c
    ON c.id = r.referral_code_id
  LEFT JOIN public.referral_conversion_events g
    ON g.referral_code_id = r.referral_code_id
   AND g.referred_user_id = r.redeemer_user_id
   AND g.event_type = 'signup_completed'
  LEFT JOIN public.referral_conversion_events s
    ON s.referral_code_id = r.referral_code_id
   AND s.referred_user_id = r.redeemer_user_id
   AND s.event_type = 'subscription_completed'
  WHERE c.owner_user_id = v_target
    AND c.code_type = 'creator_standard'
  ORDER BY r.redeemed_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION public.creator_get_history(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.creator_get_history(UUID, INTEGER) TO authenticated;

-- 7) Keep old helper aligned (existing app paths still call this)
CREATE OR REPLACE FUNCTION public.create_my_referral_code(p_client_meta JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.creator_get_or_create_primary_code();
END;
$$;

REVOKE ALL ON FUNCTION public.create_my_referral_code(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_my_referral_code(JSONB) TO authenticated;
