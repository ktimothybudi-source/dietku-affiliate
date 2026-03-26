-- Add micronutrient columns to make Gula/Serat/Sodium cards use persisted meal data.
ALTER TABLE food_entries
ADD COLUMN IF NOT EXISTS sugar NUMERIC(7,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS fiber NUMERIC(7,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS sodium NUMERIC(9,2) NOT NULL DEFAULT 0;
