-- One-time migration if you already ran the old Clerk schema (`clerk_id`).
-- Run in SQL Editor after backup.

alter table if exists public.profiles rename column clerk_id to user_id;
-- If constraints named clerk_id exist, rename manually in your DB inspector.
