# App Review Notes Template (Resubmission)

Use this text in the **App Review Information -> Notes** field and replace placeholders.

---

Hello App Review Team,

Thank you for the feedback. We fixed all issues from Submission ID `3dc130b5-e1ed-4eba-979a-688601a93857`.

## Test Account

- Email: `{{REVIEWER_EMAIL}}`
- Password: `{{REVIEWER_PASSWORD}}`

## Fixes in this build

1. **Guideline 2.1(a) / Guideline 4 (UI flow and iPad layout)**
   - Resolved onboarding/sign-in CTA visibility issues on iPad size classes.
   - Confirmed users can continue through onboarding and complete sign in.

2. **Guideline 5.1.1(ii) (Camera purpose string)**
   - Updated camera permission text to clearly explain usage and example:
   - Camera is used to scan food photos/barcodes for nutrition logging.

3. **Guideline 5.1.1(v) (Account deletion)**
   - Added in-app permanent account deletion path:
     - Profile -> Delete Account -> Final confirmation -> Account deleted.

4. **Guideline 3.1.2(c) (Subscriptions)**
   - Paywall now displays:
     - subscription title,
     - billed amount as the most prominent price,
     - trial duration and post-trial auto-renew billing disclosure,
     - working links to Terms and Privacy,
     - restore purchases action.

5. **Guideline 2.1(b) (IAP reliability)**
   - Updated purchase error handling and recovery/restore flow.
   - Validated sandbox purchase/restore paths.

6. **Guideline 2.3.2 (Metadata)**
   - App metadata now clearly indicates premium content requires separate purchase.

## Attached recordings

1. `account-deletion-flow.mp4`: sign in -> profile -> delete account -> confirmation.
2. `iap-flow.mp4`: paywall legal links visible -> purchase/restore completion.

## Device coverage

- Tested on iPad Air 11-inch class and iPhone Pro Max class.

Please let us know if you need any additional details.

---
