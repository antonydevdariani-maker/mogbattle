alter table public.matches
  add column if not exists vonage_session_id text;
