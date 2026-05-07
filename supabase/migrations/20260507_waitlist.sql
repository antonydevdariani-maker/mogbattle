create table if not exists waitlist (
  id uuid default gen_random_uuid() primary key,
  email text unique not null,
  name text,
  created_at timestamptz default now()
);
