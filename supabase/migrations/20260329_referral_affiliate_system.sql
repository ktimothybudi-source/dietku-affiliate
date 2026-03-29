-- Referral / affiliate system: codes, redemptions, attempt logs, profile trial, RLS, RPCs.
-- Run in Supabase SQL Editor or via migrations. Requires existing public.profiles + ai_scan_quota_bypass.

-- ---------------------------------------------------------------------------
-- A) profiles additions
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS app_role TEXT NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_app_role_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_app_role_check
      CHECK (app_role IN ('user', 'admin'));
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.referral_trial_ends_at IS
  'App access trial end from referral redemption; server-set only. is_ai_scan_quota_bypass also considers this.';

COMMENT ON COLUMN public.profiles.app_role IS
  'admin = full referral analytics + admin_create_referral_code. Set manually: UPDATE profiles SET app_role = ''admin'' WHERE id = ''...'';';

-- Partial index cannot use NOW() (not IMMUTABLE). Index non-null trial ends for lookups.
CREATE INDEX IF NOT EXISTS idx_profiles_referral_trial_ends_at
  ON public.profiles (referral_trial_ends_at)
  WHERE referral_trial_ends_at IS NOT NULL;

-- Prevent clients from forging trial end dates (redeem uses SET LOCAL bypass inside txn).
CREATE OR REPLACE FUNCTION public.profiles_protect_referral_trial_ends_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_trial_ends_at IS DISTINCT FROM OLD.referral_trial_ends_at THEN
    IF current_setting('app.allow_referral_trial_write', true) IS DISTINCT FROM 'true' THEN
      NEW.referral_trial_ends_at := OLD.referral_trial_ends_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_referral_trial ON public.profiles;
CREATE TRIGGER trg_profiles_protect_referral_trial
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_protect_referral_trial_ends_at();

-- ---------------------------------------------------------------------------
-- B) Tables: referral_codes, referral_redemptions, referral_attempt_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_normalized TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  code_kind TEXT NOT NULL CHECK (code_kind IN ('affiliate', 'promo')),
  trial_days INTEGER NOT NULL DEFAULT 7 CHECK (trial_days >= 1 AND trial_days <= 365),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT referral_codes_code_normalized_upper CHECK (code_normalized = UPPER(code_normalized))
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_code_normalized_key
  ON public.referral_codes (code_normalized);

CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_one_affiliate_per_owner
  ON public.referral_codes (owner_user_id)
  WHERE code_kind = 'affiliate';

CREATE INDEX IF NOT EXISTS referral_codes_owner_idx ON public.referral_codes (owner_user_id);
CREATE INDEX IF NOT EXISTS referral_codes_active_idx ON public.referral_codes (is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS public.referral_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code_id UUID NOT NULL REFERENCES public.referral_codes (id) ON DELETE RESTRICT,
  redeemer_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  trial_days_granted INTEGER NOT NULL CHECK (trial_days_granted >= 1 AND trial_days_granted <= 365),
  trial_ends_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_meta JSONB,
  CONSTRAINT referral_redemptions_redeemer_unique UNIQUE (redeemer_user_id)
);

CREATE INDEX IF NOT EXISTS referral_redemptions_code_idx ON public.referral_redemptions (referral_code_id);
CREATE INDEX IF NOT EXISTS referral_redemptions_redeemed_at_idx ON public.referral_redemptions (redeemed_at DESC);

CREATE TABLE IF NOT EXISTS public.referral_attempt_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  raw_input TEXT,
  normalized_code TEXT,
  outcome TEXT NOT NULL,
  error_code TEXT,
  client_meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_attempt_logs_created_idx ON public.referral_attempt_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS referral_attempt_logs_actor_idx ON public.referral_attempt_logs (actor_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_referral_codes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_codes_updated_at ON public.referral_codes;
CREATE TRIGGER trg_referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_referral_codes_updated_at();

-- ---------------------------------------------------------------------------
-- C) is_app_admin + paid entitlement (blocks stacking referral on store subs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.app_role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_app_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.user_has_blocking_paid_entitlement(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ai_scan_quota_bypass b
    WHERE b.user_id = p_uid
      AND b.is_active = TRUE
      AND COALESCE(b.note, '') NOT IN ('', 'premium_disabled')
      AND COALESCE(b.note, '') NOT ILIKE '%referral%'
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_blocking_paid_entitlement(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_blocking_paid_entitlement(UUID) TO authenticated;

-- Meal scan bypass: existing row OR active referral trial on profile
CREATE OR REPLACE FUNCTION public.is_ai_scan_quota_bypass(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ai_scan_quota_bypass b
    WHERE b.user_id = p_user_id
      AND b.is_active = TRUE
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.referral_trial_ends_at IS NOT NULL
      AND p.referral_trial_ends_at > NOW()
  );
$$;

REVOKE ALL ON FUNCTION public.is_ai_scan_quota_bypass(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ai_scan_quota_bypass(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ai_scan_quota_bypass(UUID) TO anon;

-- ---------------------------------------------------------------------------
-- D) normalize + log helper (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_referral_code(p_raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT UPPER(REGEXP_REPLACE(COALESCE(TRIM(p_raw), ''), '[^A-Za-z0-9]', '', 'g'));
$$;

REVOKE ALL ON FUNCTION public.normalize_referral_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_referral_code(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_referral_attempt(
  p_actor UUID,
  p_raw TEXT,
  p_norm TEXT,
  p_outcome TEXT,
  p_error TEXT,
  p_meta JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.referral_attempt_logs (
    actor_user_id, raw_input, normalized_code, outcome, error_code, client_meta
  ) VALUES (
    p_actor, LEFT(p_raw, 200), NULLIF(p_norm, ''), p_outcome, p_error, p_meta
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_referral_attempt(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_referral_attempt(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- E) redeem_referral_code(p_raw_code text, p_client_meta jsonb default null) -> jsonb
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_referral_code(
  p_raw_code TEXT,
  p_client_meta JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_norm TEXT;
  v_row public.referral_codes%ROWTYPE;
  v_cnt INTEGER;
  v_trial_end TIMESTAMPTZ;
  v_profile_trial TIMESTAMPTZ;
  v_has_paid BOOLEAN;
  v_already_redeemed BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    PERFORM public.log_referral_attempt(NULL, p_raw_code, NULL, 'failure', 'not_authenticated', p_client_meta);
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED', 'message', 'Masuk diperlukan.');
  END IF;

  v_norm := public.normalize_referral_code(p_raw_code);
  IF v_norm IS NULL OR LENGTH(v_norm) < 4 THEN
    PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'invalid_code',
      p_client_meta);
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_CODE', 'message', 'Kode tidak valid.');
  END IF;

  SELECT referral_trial_ends_at INTO v_profile_trial FROM public.profiles WHERE id = v_uid;
  IF v_profile_trial IS NOT NULL AND v_profile_trial > NOW() THEN
    PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'active_trial_exists',
      p_client_meta);
    RETURN jsonb_build_object('ok', false, 'error', 'ACTIVE_TRIAL_EXISTS',
      'message', 'Anda sudah memiliki akses percobaan aktif. Tidak dapat menggunakan kode lain.');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.referral_redemptions r WHERE r.redeemer_user_id = v_uid)
    INTO v_already_redeemed;
  IF v_already_redeemed THEN
    PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'already_redeemed',
      p_client_meta);
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED',
      'message', 'Akun ini sudah pernah menggunakan kode undangan.');
  END IF;

  SELECT public.user_has_blocking_paid_entitlement(v_uid) INTO v_has_paid;
  IF v_has_paid THEN
    PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'paid_subscription_active',
      p_client_meta);
    RETURN jsonb_build_object('ok', false, 'error', 'PAID_SUBSCRIPTION_ACTIVE',
      'message', 'Tidak dapat menggunakan kode saat langganan aktif.');
  END IF;

  SELECT * INTO v_row FROM public.referral_codes WHERE code_normalized = v_norm FOR UPDATE;
  IF NOT FOUND THEN
    PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'invalid_code', p_client_meta);
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_CODE', 'message', 'Kode tidak ditemukan.');
  END IF;

  IF NOT v_row.is_active THEN
    PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'inactive', p_client_meta);
    RETURN jsonb_build_object('ok', false, 'error', 'INACTIVE', 'message', 'Kode ini tidak aktif.');
  END IF;

  IF v_row.expires_at IS NOT NULL AND v_row.expires_at < NOW() THEN
    PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'expired', p_client_meta);
    RETURN jsonb_build_object('ok', false, 'error', 'EXPIRED', 'message', 'Kode sudah kedaluwarsa.');
  END IF;

  IF v_row.owner_user_id = v_uid THEN
    PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'own_code', p_client_meta);
    RETURN jsonb_build_object('ok', false, 'error', 'OWN_CODE', 'message', 'Tidak dapat menggunakan kode sendiri.');
  END IF;

  IF v_row.usage_limit IS NOT NULL THEN
    SELECT COUNT(*)::INT INTO v_cnt FROM public.referral_redemptions r
    WHERE r.referral_code_id = v_row.id;
    IF v_cnt >= v_row.usage_limit THEN
      PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'usage_limit_reached',
        p_client_meta);
      RETURN jsonb_build_object('ok', false, 'error', 'USAGE_LIMIT_REACHED',
        'message', 'Kode ini sudah mencapai batas penggunaan.');
    END IF;
  END IF;

  v_trial_end := NOW() + (v_row.trial_days::TEXT || ' days')::INTERVAL;

  PERFORM set_config('app.allow_referral_trial_write', 'true', true);

  UPDATE public.profiles
  SET referral_trial_ends_at = v_trial_end
  WHERE id = v_uid;

  INSERT INTO public.referral_redemptions (
    referral_code_id, redeemer_user_id, trial_days_granted, trial_ends_at, client_meta
  ) VALUES (
    v_row.id, v_uid, v_row.trial_days, v_trial_end, p_client_meta
  );

  PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'success', NULL, p_client_meta);

  RETURN jsonb_build_object(
    'ok', true,
    'trial_days', v_row.trial_days,
    'trial_ends_at', v_trial_end,
    'referral_code_id', v_row.id
  );
EXCEPTION
  WHEN unique_violation THEN
    PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'already_redeemed',
      p_client_meta);
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED',
      'message', 'Penggunaan ganda terdeteksi.');
  WHEN OTHERS THEN
    PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'internal_error',
      jsonb_build_object('detail', SQLERRM));
    RETURN jsonb_build_object('ok', false, 'error', 'INTERNAL_ERROR', 'message', 'Terjadi kesalahan. Coba lagi.');
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_referral_code(TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_referral_code(TEXT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- F) create_my_referral_code — affiliate, default 7 days, one per owner
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_my_referral_code(p_client_meta JSONB DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_existing RECORD;
  v_code TEXT;
  v_try INTEGER;
  v_new_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  SELECT id, code_normalized, trial_days, is_active INTO v_existing
  FROM public.referral_codes
  WHERE owner_user_id = v_uid AND code_kind = 'affiliate'
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_existed', true,
      'code', v_existing.code_normalized,
      'referral_code_id', v_existing.id,
      'trial_days', v_existing.trial_days,
      'is_active', v_existing.is_active
    );
  END IF;

  FOR v_try IN 1..40 LOOP
    v_code := UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 8));
    BEGIN
      INSERT INTO public.referral_codes (
        code_normalized, owner_user_id, code_kind, trial_days, is_active,
        usage_limit, expires_at, created_by
      ) VALUES (
        v_code, v_uid, 'affiliate', 7, TRUE, NULL, NULL, v_uid
      )
      RETURNING id INTO v_new_id;
      RETURN jsonb_build_object(
        'ok', true,
        'already_existed', false,
        'code', v_code,
        'trial_days', 7,
        'referral_code_id', v_new_id
      );
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', false, 'error', 'CODE_GENERATION_FAILED');
END;
$$;

REVOKE ALL ON FUNCTION public.create_my_referral_code(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_my_referral_code(JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- G) admin_create_referral_code — custom trial, optional caps (admin only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_referral_code(
  p_code TEXT,
  p_owner_user_id UUID,
  p_trial_days INTEGER,
  p_usage_limit INTEGER DEFAULT NULL,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_code_kind TEXT DEFAULT 'promo',
  p_is_active BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm TEXT;
  v_admin UUID := auth.uid();
BEGIN
  IF v_admin IS NULL OR NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  v_norm := public.normalize_referral_code(p_code);
  IF v_norm IS NULL OR LENGTH(v_norm) < 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_CODE');
  END IF;

  IF p_trial_days IS NULL OR p_trial_days < 1 OR p_trial_days > 365 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_TRIAL_DAYS');
  END IF;

  IF p_code_kind NOT IN ('affiliate', 'promo') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_KIND');
  END IF;

  INSERT INTO public.referral_codes (
    code_normalized, owner_user_id, code_kind, trial_days, is_active,
    usage_limit, expires_at, created_by
  ) VALUES (
    v_norm, p_owner_user_id, p_code_kind, p_trial_days, p_is_active,
    p_usage_limit, p_expires_at, v_admin
  );

  RETURN jsonb_build_object('ok', true, 'code', v_norm);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CODE_EXISTS');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_referral_code(TEXT, UUID, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, BOOLEAN)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_referral_code(TEXT, UUID, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, BOOLEAN)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- H) Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_attempt_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_codes_select_own_or_admin ON public.referral_codes;
CREATE POLICY referral_codes_select_own_or_admin
  ON public.referral_codes FOR SELECT
  USING (owner_user_id = auth.uid() OR public.is_app_admin());

DROP POLICY IF EXISTS referral_redemptions_select_redeemer ON public.referral_redemptions;
CREATE POLICY referral_redemptions_select_redeemer
  ON public.referral_redemptions FOR SELECT
  USING (redeemer_user_id = auth.uid());

DROP POLICY IF EXISTS referral_redemptions_select_code_owner ON public.referral_redemptions;
CREATE POLICY referral_redemptions_select_code_owner
  ON public.referral_redemptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.referral_codes c
      WHERE c.id = referral_redemptions.referral_code_id
        AND c.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS referral_redemptions_select_admin ON public.referral_redemptions;
CREATE POLICY referral_redemptions_select_admin
  ON public.referral_redemptions FOR SELECT
  USING (public.is_app_admin());

DROP POLICY IF EXISTS referral_attempt_logs_admin ON public.referral_attempt_logs;
CREATE POLICY referral_attempt_logs_admin
  ON public.referral_attempt_logs FOR SELECT
  USING (public.is_app_admin());

-- No direct INSERT/UPDATE/DELETE for app users on these tables (RPC only).
-- See supabase/REFERRAL_ANALYTICS.sql for reporting queries.
