/** IDR anchors when store / RevenueCat price strings are unavailable. */
const MONTHLY_IDR = 69999;
const YEARLY_IDR = 279999;

export const SUBSCRIPTION_MONTHLY_IDR_FALLBACK = 'Rp 69.999';
export const SUBSCRIPTION_YEARLY_IDR_FALLBACK = 'Rp 279.999';

/** Rounded monthly equivalent of the yearly price (for “setara / bulan” copy). */
export const SUBSCRIPTION_YEARLY_EQUIV_MONTHLY_ROUNDED = Math.round(YEARLY_IDR / 12);

/** Savings vs paying the monthly rate for 12 months. */
export const SUBSCRIPTION_YEARLY_SAVINGS_PCT_VS_MONTHLY = Math.round(
  (1 - YEARLY_IDR / (MONTHLY_IDR * 12)) * 100
);
