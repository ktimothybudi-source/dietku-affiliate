# App Store Review Triage (v1.0)

Use this tracker to assign owners and close every rejection reason before resubmission.

## Priority 1: Blocking functionality

- [ ] **2.1(a) Missing Next/Continue button**  
  Owner: `__________`  
  Scope: Onboarding flow cannot proceed on reviewer device.
- [ ] **Guideline 4 iPad layout (login button not visible)**  
  Owner: `__________`  
  Scope: Sign-in and onboarding CTA visibility on iPad size classes.
- [ ] **2.1(b) IAP purchase error**  
  Owner: `__________`  
  Scope: Sandbox purchase/restore reliability on iPhone + iPad.

## Priority 2: Compliance and legal

- [ ] **5.1.1(ii) Camera purpose string clarity**  
  Owner: `__________`  
  Scope: Purpose strings in `app.json` must explain concrete in-app usage and example.
- [ ] **5.1.1(v) In-app account deletion**  
  Owner: `__________`  
  Scope: Visible delete-account entry point + full permanent deletion flow.
- [ ] **3.1.2(c) Subscription legal links + pricing clarity**  
  Owner: `__________`  
  Scope: Terms/Privacy links, explicit auto-renew text, billed amount prominence.

## Priority 3: Metadata

- [ ] **2.3.2 Paid feature disclosure in metadata**  
  Owner: `__________`  
  Scope: App description and screenshots clearly mark paid/premium features.
- [ ] **3.1.2(c) Terms of Use (EULA) in metadata**  
  Owner: `__________`  
  Scope: Terms link in App Description (or custom EULA field in App Store Connect).

## Required Evidence for App Review Notes

- [ ] Screen recording: sign in -> navigate to delete account -> confirm permanent deletion.
- [ ] Screen recording: paywall shows Terms + Privacy links and successful purchase/restore flow.
- [ ] Mention tested devices: iPad Air 11-inch class + iPhone Pro Max class.
- [ ] Include reviewer test account credentials.
