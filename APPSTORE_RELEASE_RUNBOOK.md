# DietKu App Store Release Runbook

This is the execution guide for iOS release with Expo + EAS + RevenueCat + Supabase.

## 1) App Identity (one-time)

- App Store Connect app name: `DietKu`
- Bundle ID: `app.rork.dietku-clone-jlejfwy`
- Version source: `app.json` -> `expo.version`
- Build number source: `app.json` -> `expo.ios.buildNumber` (EAS production auto-increments it)

## 2) Required iOS Environment Variables

Set these in EAS for `preview` and `production`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_BASE_URL` (must be HTTPS public backend URL)
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` (RevenueCat Apple public SDK key)
- `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` (keep for Android parity)

Server-only (Render only, never in `EXPO_PUBLIC_*`):

- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 3) RevenueCat + Apple Subscriptions

In App Store Connect:

1. Create one subscription group.
2. Create 2 auto-renewing products:
   - Monthly: `IDR 129.000`
   - Yearly: `IDR 399.000`
3. Save product IDs (you will map these in RevenueCat).

In RevenueCat:

1. Add iOS app for the same bundle ID.
2. Ensure entitlement `premium` exists.
3. Map monthly and yearly iOS product IDs to entitlement `premium`.
4. Add products to the current offering.

## 4) Build and Upload

```bash
bun run build:ios:prod
bun run submit:ios:prod
```

If you need internal testing first:

```bash
bun run build:ios:preview
```

## 5) TestFlight Smoke Test

Required pass criteria:

- Login/logout works.
- Camera scan works.
- Free user limit remains 3 scans/day.
- Premium purchase unlocks unlimited scans.
- Restore purchase works after reinstall/login.
- Premium analytics/home gating unlocks after purchase.

## 6) App Review Notes Template

Use this in App Store Connect -> App Review Information:

- Test account email: `<fill>`
- Test account password: `<fill>`
- How to access paywall: Open camera scan, exceed free limit, tap `Upgrade Premium`.
- IAP products: Monthly and yearly subscriptions under entitlement `premium`.
- Restore path: Paywall -> `Pulihkan Pembelian`.
- Backend: subscription status syncs to `/api/ai/subscription-sync`.

## 7) Pre-Submit Gate

Ship only if all are true:

- iOS subscriptions are `Ready to Submit`/approved and mapped in RevenueCat.
- TestFlight build passes smoke test on real iPhone.
- Privacy Policy and Terms URLs are public and up to date.
- Account deletion path is visible in app or support flow.
- No server secrets exist in `EXPO_PUBLIC_*`.
