-- Persistent AI meal-scan quota tracking and bypass controls.
-- This replaces in-memory daily counters so limits stay consistent across deploy/restarts.

CREATE TABLE IF NOT EXISTS public.ai_scan_quota_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  requester_id TEXT NOT NULL,
  user_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_scan_quota_events_requester_created
  ON public.ai_scan_quota_events (requester_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_scan_quota_events_user_created
  ON public.ai_scan_quota_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_scan_quota_bypass (
  user_id UUID PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.touch_ai_scan_quota_bypass_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_scan_quota_bypass_updated_at ON public.ai_scan_quota_bypass;
CREATE TRIGGER trg_ai_scan_quota_bypass_updated_at
BEFORE UPDATE ON public.ai_scan_quota_bypass
FOR EACH ROW
EXECUTE FUNCTION public.touch_ai_scan_quota_bypass_updated_at();

CREATE OR REPLACE FUNCTION public.is_ai_scan_quota_bypass(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ai_scan_quota_bypass b
    WHERE b.user_id = p_user_id
      AND b.is_active = TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.is_ai_scan_quota_bypass(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_ai_scan_quota_bypass(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ai_scan_quota_bypass(UUID) TO anon;

CREATE OR REPLACE FUNCTION public.peek_ai_scan_quota(
  p_requester_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 3,
  p_window INTERVAL DEFAULT INTERVAL '24 hours'
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_in_sec INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_window_start TIMESTAMPTZ := v_now - p_window;
  v_count INTEGER := 0;
  v_oldest TIMESTAMPTZ := NULL;
BEGIN
  SELECT COUNT(*)::INT, MIN(e.created_at)
  INTO v_count, v_oldest
  FROM public.ai_scan_quota_events e
  WHERE e.requester_id = p_requester_id
    AND e.created_at >= v_window_start;

  allowed := v_count < p_limit;
  remaining := GREATEST(0, p_limit - v_count);

  IF v_oldest IS NULL THEN
    reset_in_sec := CEIL(EXTRACT(EPOCH FROM p_window))::INT;
  ELSE
    reset_in_sec := GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((v_oldest + p_window) - v_now)))::INT);
  END IF;

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_ai_scan_quota(
  p_requester_id TEXT,
  p_user_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 3,
  p_window INTERVAL DEFAULT INTERVAL '24 hours'
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_in_sec INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_window_start TIMESTAMPTZ := v_now - p_window;
  v_count INTEGER := 0;
  v_oldest TIMESTAMPTZ := NULL;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_requester_id));

  SELECT COUNT(*)::INT, MIN(e.created_at)
  INTO v_count, v_oldest
  FROM public.ai_scan_quota_events e
  WHERE e.requester_id = p_requester_id
    AND e.created_at >= v_window_start;

  IF v_count < p_limit THEN
    INSERT INTO public.ai_scan_quota_events (requester_id, user_id)
    VALUES (p_requester_id, p_user_id);

    allowed := TRUE;
    v_count := v_count + 1;
    IF v_oldest IS NULL THEN
      v_oldest := v_now;
    END IF;
  ELSE
    allowed := FALSE;
  END IF;

  remaining := GREATEST(0, p_limit - v_count);

  IF v_oldest IS NULL THEN
    reset_in_sec := CEIL(EXTRACT(EPOCH FROM p_window))::INT;
  ELSE
    reset_in_sec := GREATEST(1, CEIL(EXTRACT(EPOCH FROM ((v_oldest + p_window) - v_now)))::INT);
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.peek_ai_scan_quota(TEXT, UUID, INTEGER, INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_ai_scan_quota(TEXT, UUID, INTEGER, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peek_ai_scan_quota(TEXT, UUID, INTEGER, INTERVAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_scan_quota(TEXT, UUID, INTEGER, INTERVAL) TO authenticated;
GRANT EXECUTE ON FUNCTION public.peek_ai_scan_quota(TEXT, UUID, INTEGER, INTERVAL) TO anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_scan_quota(TEXT, UUID, INTEGER, INTERVAL) TO anon;
