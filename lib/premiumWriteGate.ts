/**
 * Synced from SubscriptionProvider each render so NutritionContext (a parent provider)
 * can gate writes without importing useSubscription (circular).
 */
let premiumWritesAllowed = false;

export function setPremiumWriteGate(allowed: boolean): void {
  premiumWritesAllowed = allowed;
}

export function getPremiumWriteGate(): boolean {
  return premiumWritesAllowed;
}
