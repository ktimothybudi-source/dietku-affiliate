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
   - EAS env `preview` and `production`: same key

## 3) EAS Commands

```bash
# Set iOS RevenueCat key in EAS preview
bunx eas-cli env:create --scope project --environment preview --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value "<YOUR_IOS_PUBLIC_SDK_KEY>" --non-interactive

# Set iOS RevenueCat key in EAS production
bunx eas-cli env:create --scope project --environment production --name EXPO_PUBLIC_REVENUECAT_IOS_API_KEY --value "<YOUR_IOS_PUBLIC_SDK_KEY>" --non-interactive
```

## 4) Verification

- Start app on iOS build.
- Open paywall and confirm plans render.
- Buy monthly/yearly in sandbox.
- Confirm premium unlock + backend sync (`/api/ai/subscription-sync`).
