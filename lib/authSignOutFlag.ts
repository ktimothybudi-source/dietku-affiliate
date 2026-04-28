/**
 * NutritionContext treats SIGNED_OUT as intentional only when this short-lived guard is active.
 * This avoids stale state from older flows forcing unexpected logouts.
 */
const INTENT_TTL_MS = 12_000;
type IntentState = { value: boolean; updatedAt: number };

let signOutIntent: IntentState = { value: false, updatedAt: 0 };

export function setExpectUserInitiatedSignOut(value: boolean) {
  signOutIntent = { value, updatedAt: Date.now() };
}

export function clearExpectUserInitiatedSignOut() {
  signOutIntent = { value: false, updatedAt: 0 };
}

export function consumeExpectUserInitiatedSignOut(): boolean {
  const now = Date.now();
  const isFresh = signOutIntent.value && now - signOutIntent.updatedAt <= INTENT_TTL_MS;
  clearExpectUserInitiatedSignOut();
  return isFresh;
}
