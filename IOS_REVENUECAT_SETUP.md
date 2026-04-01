# iOS RevenueCat Setup (DietKu)

Use this to complete iOS subscription wiring.

## 1) App Store Connect

1. Create subscription group: `DietKu Premium`.
2. Create auto-renewable products:
   - Monthly price: `IDR 129.000`
   - Yearly price: `IDR 399.000`
3. Save product IDs:
   - `IOS_MONTHLY_PRODUCT_ID=<fill>`
   - `IOS_YEARLY_PRODUCT_ID=<fill>`

## 2) RevenueCat

1. Add iOS app with bundle ID `app.rork.dietku-clone-jlejfwy`.
2. Create entitlement `premium` (if missing).
3. Add both iOS products and attach both to entitlement `premium`.
4. Add both packages to current offering.
5. Copy Apple public SDK key and set:
   - local `.env`: `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=<key>`
   - EAS env **`preview`** and **`production`**: same key (required for any EAS iOS build that uses those environments; local `.env` is **not** uploaded to EAS)

## 3) EAS Commands

RevenueCat → **Project settings** → **API keys** → Apple app → **public** SDK key (`appl_…`).

Non-interactive create (includes `--visibility`, which EAS requires in CI/non-interactive mode):

```bash
# Preview (internal iOS builds using the preview profile)
bunx eas-cli env:create --scope project --environment preview --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value "<YOUR_IOS_PUBLIC_SDK_KEY>" --non-interactive --type string --visibility sensitive

# Production (App Store / TestFlight)
bunx eas-cli env:create --scope project --environment production --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value "<YOUR_IOS_PUBLIC_SDK_KEY>" --non-interactive --type string --visibility sensitive
```

If the variable already exists, update it in [Expo → Environment variables](https://expo.dev) or use `eas env:update` with the same flags your CLI version documents.

## 4) Verification

**After `eas build` starts**, the log line *“Environment variables … loaded from the `production` environment”* (or `preview`) must include **`EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`**. If it is missing, the IPA will show “Pembayaran belum siap” / RevenueCat not configured on iOS.

Then:

- Install the new iOS build, open paywall, confirm plans render.
- Buy monthly/yearly in sandbox.
- Confirm premium unlock + backend sync (`/api/ai/subscription-sync`).
