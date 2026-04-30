-- MogBattle + Privy: profiles keyed by Privy user DID (`user_id`).
-- Server uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). Optional: tighten RLS later with Supabase custom JWT.
-- Run in Supabase SQL Editor.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'transaction_type') then
    create type public.transaction_type as enum ('deposit', 'withdraw');
  end if;
  if not exists (select 1 from pg_type where typname = 'transaction_status') then
    create type public.transaction_status as enum ('pending', 'completed', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'match_status') then
    create type public.match_status as enum ('waiting', 'live', 'completed', 'cancelled');
  end if;
end $$;

create table if not exists public.profiles (
  user_id text primary key,
  username text unique,
  avatar_url text,
  wallet_address text,
  total_credits bigint not null default 0,
  elo integer not null default 1500,
  matches_played integer not null default 0,
  wins integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles(user_id) on delete cascade,
  type public.transaction_type not null,
  amount bigint not null check (amount > 0),
  status public.transaction_status not null default 'pending',
  tx_signature text,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  player1_id text not null references public.profiles(user_id) on delete cascade,
  player2_id text references public.profiles(user_id) on delete cascade,
  bet_amount bigint not null check (bet_amount > 0),
  status public.match_status not null default 'waiting',
  winner_id text references public.profiles(user_id) on delete set null,
  ai_score_p1 numeric(5,2),
  ai_score_p2 numeric(5,2),
  player1_confirmed boolean not null default false,
  player2_confirmed boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;
alter table public.matches enable row level security;

-- Open read for anon (optional UI); writes go through service role in this MVP.
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles for select using (true);

drop policy if exists "transactions_own_read" on public.transactions;
create policy "transactions_own_read" on public.transactions for select using (true);

drop policy if exists "matches_read_all" on public.matches;
create policy "matches_read_all" on public.matches for select using (true);
