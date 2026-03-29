-- Persist user-defined weekly weight change (kg/week) from onboarding / edit profile.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_weight_change NUMERIC(5,2);

COMMENT ON COLUMN public.profiles.weekly_weight_change IS 'Target absolute kg change per week; sign of deficit/surplus is implied by goal (fat_loss vs muscle_gain).';
