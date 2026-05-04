create table if not exists broadcasts (
  id uuid default gen_random_uuid() primary key,
  message text not null,
  sender_username text not null,
  created_at timestamptz default now()
);
