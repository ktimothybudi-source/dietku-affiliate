# App Review Manual Test Script

This script is for the required physical-device recordings and final QA.

## A) Account Deletion Recording (Guideline 5.1.1(v))

1. Launch app and sign in with reviewer/test account.
2. Open `Profile` tab.
3. Tap `Hapus akun` / `Delete account`.
4. Confirm first alert (`Hapus` / `Delete`).
5. Confirm second alert (`Hapus permanen` / `Permanently delete`).
6. Show success state (user signed out and returned to sign-in/onboarding state).

Suggested recording name: `account-deletion-flow.mp4`.

## B) Subscription + Legal + IAP Recording (Guideline 3.1.2(c), 2.1(b))

1. Open paywall screen (`onboarding-subscription` or premium modal).
2. Show both plans and billed amount text:
   - annual billed amount,
   - monthly billed amount.
3. Show trial text and post-trial auto-renew disclosure.
4. Tap `Ketentuan` and `Privasi` links to verify they open.
5. Return to app and complete sandbox purchase.
6. Trigger `Pulihkan Pembayaran` / restore purchases and verify success.

Suggested recording name: `iap-flow.mp4`.

## C) iPad Layout and Flow Verification (Guideline 2.1(a), 4)

1. Fresh install on iPad size class.
2. On onboarding, ensure each step has visible `Next/Continue` CTA.
3. Open sign-in screen and verify login button is visible without clipping.
4. Repeat in portrait + landscape.

## D) Metadata Verification (Guideline 2.3.2)

1. In App Store Connect description, label premium-only features.
2. Ensure Terms URL is present in description (or custom EULA field).
3. Ensure Privacy URL field is populated.
