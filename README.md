# DietKu Affiliate Platform

Web dashboard for DietKu affiliates. Track trials vs paid conversions, commissions, and promo codes. Lives in `affiliate-platform/` and uses the same Supabase project as the mobile app.

**Stack:** Next.js 14.2.7, React 18.3.1, Supabase JS, Zod  
**UI title:** DietKu Affiliates  
**Money:** IDR (`formatIdr` in `lib/format.js`)  
**Commission:** 30% of each converted subscription (`amount_idr`), set by a Postgres trigger in `supabase/migrations/20260517_affiliate_referral_tracking.sql`

## Pages

| Path | What it does |
| --- | --- |
| `/` | Redirects to `/dashboard` if logged in, otherwise `/login` |
| `/login` | Email + password |
| `/signup` | Name, email, password (min 6), promo code |
| `/dashboard` | Trial vs paid signup counts, commission totals, checkout referral link |
| `/referrals` | Per-buyer list: Free trial / Paid / Trial ended / Cancelled, monthly vs yearly |
| `/earnings` | Commission history (paid conversions only) plus active trials at Rp 0 |
| `/leaderboard` | Affiliates ranked by paid monthly + yearly sales |
| `/settings` | Change promo code; live availability check |
| `/join?code=` | Group invite landing page (not affiliate checkout). Opens DietKu via `rork-app://browse-groups`, then App Store / Play Store |

Sidebar: Dashboard, Referrals, Earnings, Leaderboard, Settings, Logout.

## Auth

- Signup creates a Supabase Auth user (`email_confirm: true`) and a row in `public.affiliates`.
- Login uses `signInWithPassword`, then looks up `affiliates` by email.
- Session is an httpOnly cookie `affiliate_session` (affiliate UUID, 30 days).
- Middleware sends unauthenticated users away from `/dashboard`, `/earnings`, `/leaderboard`, and `/settings`. APIs return 401 without a session.

Promo codes: 4–16 characters, `A–Z` and `0–9` only. Stored as `promo_code` (or `referral_code` if that column is what exists). Fallback display code if none is set: `DIETKU10`.

## Data

Tables from the main-app migration `supabase/migrations/20260517_affiliate_referral_tracking.sql`:

- `affiliates` — name, email, promo code
- `referrals` — status `trial_active` \| `converted` \| `expired` \| `cancelled`; plan `bulanan` \| `tahunan`
- `commissions` — status `pending` \| `confirmed` \| `paid`; created when a referral converts

Paid conversions only earn money. Trials show on dashboard/earnings but commission is 0 until `converted`.

Dashboard referral link:

`{NEXT_PUBLIC_APP_BASE_URL}/checkout?code={PROMO}`

## API

| Method | Path | Auth |
| --- | --- | --- |
| POST | `/api/auth/signup` | no |
| POST | `/api/auth/login` | no |
| POST | `/api/auth/logout` | cookie |
| GET | `/api/dashboard` | cookie |
| GET | `/api/referrals` | cookie |
| GET | `/api/earnings` | cookie |
| GET | `/api/leaderboard` | cookie |
| GET | `/api/affiliates/promo-code` | cookie |
| PATCH | `/api/affiliates/promo-code` | cookie |
| GET | `/api/affiliates/code-availability?code=` | cookie |

## Local setup

From `affiliate-platform/`:

1. Copy `.env.example` to `.env.local`
2. Fill:

```
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Use the same Supabase project as DietKu. `SUPABASE_SERVICE_ROLE_KEY` is server-only.

3. In the Supabase SQL editor, run `supabase/migrations/20260517_affiliate_referral_tracking.sql` (affiliate tables, 30% commission trigger, trial/paid tracking).
4. Install and run:

```
npm install
npm run dev
```

Then open http://localhost:3000 — you will land on `/login`. Create an account at `/signup`.

Other scripts: `npm run build`, `npm start`, `npm run lint`.

## Store links used by `/join`

- App Store: DietKu — Hitung Kalori Harian (`id6761396062`)
- Play Store: `app.rork.dietku_clone_jlejfwy`
