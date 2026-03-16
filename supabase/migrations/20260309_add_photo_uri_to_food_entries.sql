-- Migration: add photo_uri column to food_entries
-- Run this in Supabase SQL Editor if you see:
-- \"Could not find the 'photo_uri' column of 'food_entries' in the schema cache\"

ALTER TABLE food_entries
ADD COLUMN IF NOT EXISTS photo_uri TEXT;

