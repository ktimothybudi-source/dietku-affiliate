# DietKu Play Store Release Runbook

This runbook is the execution version of the Play Store launch plan.

## 1) Finalize release identity

1. Open `app.json`.
2. Confirm:
   - `expo.name`
   - `expo.version`
   - `expo.android.package`
   - `expo.android.permissions` (minimum required)
3. Increase `expo.android.versionCode` before each new production upload.

## 2) Production environment checks

1. Set production values in `.env` (never commit secrets):
   - `OPENAI_API_KEY` (server only)
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `EXPO_PUBLIC_API_BASE_URL`
2. Confirm client code does not expose OpenAI secret:
   - only backend reads `OPENAI_API_KEY`
   - no `EXPO_PUBLIC_OPENAI_API_KEY`

## 3) Backend verification

1. Start backend.
2. Verify endpoints:
   - `GET /` returns `status: ok`
   - `POST /api/ai/meal-analysis`
   - `POST /api/ai/meal-analysis-quota`
   - `POST /api/ai/exercise-estimate`
3. Validate scan quota behavior:
   - 3 scans allowed in 24h window
   - 4th blocked with HTTP 429
   - client shows reset countdown

## 4) Supabase production checks

1. Run pending migrations from `supabase/migrations` on production.
2. Re-verify RLS behavior:
   - signup/login
   - create group, join by code
   - post photo + feed image loading
   - member counts/visibility
3. Validate storage policy for meal/community photos.

## 5) Legal and Play policy

1. Ensure Privacy Policy and Terms URLs are public and reachable.
2. In Play Console complete:
   - App content
   - Data safety
   - Content rating
   - Ads declaration (if applicable)
3. Confirm support email/contact details match in-app legal pages.

## 6) Build and submit with EAS

1. Install EAS CLI (if needed):
   - `bunx eas-cli --version`
2. Login/configure:
   - `bunx eas-cli login`
   - `bunx eas-cli build:configure`
3. Run release checks:
   - `bun run release:checks`
4. Build Android AAB:
   - `bun run build:android:prod`
5. Submit to Play:
   - `bun run submit:android:prod`

## 7) Rollout sequence

1. Upload first to Internal testing.
2. Test on real devices (minimum 2 Android models).
3. Fix blockers.
4. Roll out to Production with staged release:
   - 10% -> 25% -> 50% -> 100%

## 8) Post-release monitoring

Monitor for first 48 hours:
- crashes/ANRs (Android vitals)
- backend errors on AI routes
- scan quota false positives
- auth/community regressions

Have a hotfix build path ready before full rollout.
