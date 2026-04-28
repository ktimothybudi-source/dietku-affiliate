# DietKu Affiliate Platform

Standalone affiliate website, separate from the mobile app, but aligned with DietKu branding.

## Features

- Affiliate registration with unique referral code generation
- Referral attribution endpoint for sign-up flow integration
- Affiliate dashboard with clicks, visits, signups, conversions, rewards, and personal rank
- Public leaderboard with weekly, monthly, and all-time windows
- Admin panel for payout queueing
- Fraud prevention basics:
  - Self-referral blocking
  - Duplicate user attribution blocking

## Run locally

1. Copy `.env.example` to `.env.local` and fill Supabase keys.
2. Apply `supabase/schema.sql` in your Supabase SQL editor.
3. Install and run:

```bash
npm install
npm run dev
```

## Integrating with your app sign-up flow

Call `POST /api/referrals/attribute` after user registration with:

- `referralCode`
- `referredUserId`
- `referredEmail`
- `ipAddress`
- `userAgent`

This will attach new users to an affiliate automatically.
