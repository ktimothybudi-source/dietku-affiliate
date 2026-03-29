-- Admin audit, profile RLS for admins, referral list view, admin patch RPCs.
-- Apply after 20260329_referral_affiliate_system.sql

-- ---------------------------------------------------------------------------
-- Profiles: admins can read all (for admin dashboard owner display)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select_admin_all ON public.profiles;
CREATE POLICY profiles_select_admin_all
  ON public.profiles FOR SELECT
  USING (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- Referral admin audit log (admin read-only via RLS)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.referral_admin_audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  referral_code_id UUID REFERENCES public.referral_codes (id) ON DELETE SET NULL,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_admin_audit_log_code_idx
  ON public.referral_admin_audit_log (referral_code_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_admin_audit_log_created_idx
  ON public.referral_admin_audit_log (created_at DESC);

ALTER TABLE public.referral_admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_admin_audit_select_admin ON public.referral_admin_audit_log;
CREATE POLICY referral_admin_audit_select_admin
  ON public.referral_admin_audit_log FOR SELECT
  USING (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- View: codes + redemption stats (inherits referral_codes RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.referral_codes_with_stats AS
SELECT
  c.id,
  c.code_normalized,
  c.owner_user_id,
  c.code_kind,
  c.trial_days,
  c.is_active,
  c.usage_limit,
  c.expires_at,
  c.created_by,
  c.created_at,
  c.updated_at,
  (SELECT COUNT(*)::INT FROM public.referral_redemptions r WHERE r.referral_code_id = c.id) AS redemption_count,
  (SELECT MAX(r.redeemed_at) FROM public.referral_redemptions r WHERE r.referral_code_id = c.id) AS last_redeemed_at,
  CASE
    WHEN c.usage_limit IS NULL THEN NULL::INT
    ELSE GREATEST(0, c.usage_limit - (SELECT COUNT(*)::INT FROM public.referral_redemptions r2 WHERE r2.referral_code_id = c.id))
  END AS remaining_uses
FROM public.referral_codes c;

GRANT SELECT ON public.referral_codes_with_stats TO authenticated;

-- ---------------------------------------------------------------------------
-- redeem_referral_code: align error codes (HAS_ACTIVE_SUBSCRIPTION for paid;
-- HAS_ACTIVE_TRIAL for active referral trial)
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
    PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'has_active_trial',
      p_client_meta);
    RETURN jsonb_build_object('ok', false, 'error', 'HAS_ACTIVE_TRIAL',
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
    PERFORM public.log_referral_attempt(v_uid, p_raw_code, v_norm, 'failure', 'has_active_subscription',
      p_client_meta);
    RETURN jsonb_build_object('ok', false, 'error', 'HAS_ACTIVE_SUBSCRIPTION',
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

-- ---------------------------------------------------------------------------
-- Admin: patch referral code + audit
-- ---------------------------------------------------------------------------
-- Full row replace (client sends current row + edits). usage_limit / expires_at may be NULL.
CREATE OR REPLACE FUNCTION public.admin_patch_referral_code(
  p_id UUID,
  p_trial_days INTEGER,
  p_usage_limit INTEGER,
  p_expires_at TIMESTAMPTZ,
  p_is_active BOOLEAN,
  p_owner_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := auth.uid();
  v_old RECORD;
BEGIN
  IF v_admin IS NULL OR NOT public.is_app_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT * INTO v_old FROM public.referral_codes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  END IF;

  IF p_trial_days IS NULL OR p_trial_days < 1 OR p_trial_days > 365 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_TRIAL_DAYS');
  END IF;

  IF p_usage_limit IS NOT NULL AND p_usage_limit <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_USAGE_LIMIT');
  END IF;

  IF p_owner_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_OWNER');
  END IF;

  INSERT INTO public.referral_admin_audit_log (
    admin_user_id, action, referral_code_id, old_values, new_values
  ) VALUES (
    v_admin,
    'patch',
    p_id,
    to_jsonb(v_old),
    jsonb_build_object(
      'trial_days', p_trial_days,
      'usage_limit', p_usage_limit,
      'expires_at', p_expires_at,
      'is_active', p_is_active,
      'owner_user_id', p_owner_user_id
    )
  );

  UPDATE public.referral_codes
  SET
    trial_days = p_trial_days,
    usage_limit = p_usage_limit,
    expires_at = p_expires_at,
    is_active = p_is_active,
    owner_user_id = p_owner_user_id,
    updated_at = NOW()
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_patch_referral_code(UUID, INTEGER, INTEGER, TIMESTAMPTZ, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_patch_referral_code(UUID, INTEGER, INTEGER, TIMESTAMPTZ, BOOLEAN, UUID) TO authenticated;
