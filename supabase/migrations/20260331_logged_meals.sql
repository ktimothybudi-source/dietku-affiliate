-- Composed meals: parent + line items, linked from food_entries for dashboard totals.
-- Run in Supabase SQL Editor or via migrations.

CREATE TABLE IF NOT EXISTS public.logged_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  display_name TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'late_snack')),
  calories NUMERIC(9,2) NOT NULL DEFAULT 0,
  protein NUMERIC(9,2) NOT NULL DEFAULT 0,
  carbs NUMERIC(9,2) NOT NULL DEFAULT 0,
  fat NUMERIC(9,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.logged_meal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_meal_id UUID NOT NULL REFERENCES public.logged_meals(id) ON DELETE CASCADE,
  food_id BIGINT,
  food_name TEXT NOT NULL,
  grams NUMERIC(10,2) NOT NULL CHECK (grams > 0),
  calories NUMERIC(9,2) NOT NULL,
  protein NUMERIC(9,2) NOT NULL,
  carbs NUMERIC(9,2) NOT NULL,
  fat NUMERIC(9,2) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_logged_meals_user_date ON public.logged_meals(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_logged_meal_items_meal ON public.logged_meal_items(logged_meal_id);

ALTER TABLE public.food_entries
  ADD COLUMN IF NOT EXISTS logged_meal_id UUID REFERENCES public.logged_meals(id) ON DELETE SET NULL;

-- Optional: widen meal_type on food_entries for late_snack (idempotent safe alter)
ALTER TABLE public.food_entries DROP CONSTRAINT IF EXISTS food_entries_meal_type_check;
ALTER TABLE public.food_entries ADD CONSTRAINT food_entries_meal_type_check
  CHECK (meal_type IS NULL OR meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'late_snack'));

-- Deleting the dashboard row removes the composed meal and its line items.
CREATE OR REPLACE FUNCTION public.cleanup_logged_meal_after_food_entry_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.logged_meal_id IS NOT NULL THEN
    DELETE FROM public.logged_meals WHERE id = OLD.logged_meal_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_logged_meal_after_food_entry_delete ON public.food_entries;
CREATE TRIGGER trg_cleanup_logged_meal_after_food_entry_delete
  AFTER DELETE ON public.food_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_logged_meal_after_food_entry_delete();

ALTER TABLE public.logged_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logged_meal_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own logged meals" ON public.logged_meals;
CREATE POLICY "Users manage own logged meals"
  ON public.logged_meals FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own logged meal items" ON public.logged_meal_items;
CREATE POLICY "Users manage own logged meal items"
  ON public.logged_meal_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.logged_meals m
      WHERE m.id = logged_meal_id AND m.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.logged_meals m
      WHERE m.id = logged_meal_id AND m.user_id = auth.uid()
    )
  );

-- food_entries RLS: allow insert/update selecting logged_meal owned by user (existing policies cover row ownership)
