# MogBattle

1v1 mog arena: **Privy** (wallet + email/social) + **Supabase** + Next.js 15.

## Setup

1. `cp .env.example .env.local`
2. **Privy**: create an app → copy App ID + App Secret.
3. **Supabase**: run `supabase/schema.sql` in the SQL Editor. If migrating from old Clerk schema, see `supabase/migrate_clerk_to_privy.sql`.
4. Add **service role** key to `SUPABASE_SERVICE_ROLE_KEY` (server-only; used by server actions after verifying Privy tokens).

```bash
npm install
npm run dev
```

- Landing: `/`
- Login: `/login` (wallet-first + email/Google)
- App: `/dashboard`, `/wallet`, `/battle`, `/match/[id]`

## Auth model

- Primary profile key: **`profiles.user_id`** = Privy user DID (`verifyAuthToken` → `userId`).
- **`wallet_address`** synced from the linked wallet when available.
- All mutations go through server actions → **Privy token verified** → **Supabase service role**.

## Notes

- `@privy-io/server-auth` is deprecated upstream in favor of `@privy-io/node`; swap when you upgrade.
- Match queue updates use **polling** (no Clerk JWT on the browser Supabase client).
