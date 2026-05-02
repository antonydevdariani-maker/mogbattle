-- Migration: add 'matched' status + missing columns to matches table
-- Run in Supabase SQL Editor

-- 1. Add 'matched' to enum (safe if already exists)
ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS 'matched';

-- 2. Drop the > 0 constraint on bet_amount (breaks free matches with 0)
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_bet_amount_check;
ALTER TABLE public.matches ALTER COLUMN bet_amount SET DEFAULT 0;

-- 3. Add missing columns
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS negotiation_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS player1_bet_offer bigint,
  ADD COLUMN IF NOT EXISTS player2_bet_offer bigint;
