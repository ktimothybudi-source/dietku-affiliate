-- Ensure one weight row per user per exact recorded_at timestamp
-- Needed so upsert(onConflict: 'user_id,recorded_at') works reliably.

-- 1) Remove duplicate rows while keeping the newest created_at record.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, recorded_at
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM weight_history
)
DELETE FROM weight_history
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE rn > 1
);

-- 2) Create unique index for conflict handling.
CREATE UNIQUE INDEX IF NOT EXISTS idx_weight_history_user_recorded_at_unique
ON weight_history(user_id, recorded_at);
