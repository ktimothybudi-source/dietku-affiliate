import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Comma-separated emails treated as Premium (UI + scan bypass sync). Remove when using real subscriptions only. */
function parsePremiumEmailAllowlist(): Set<string> {
  const raw = process.env.EXPO_PUBLIC_PREMIUM_EMAIL_ALLOWLIST ?? '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Alert, Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { callAIProxy } from '@/utils/aiProxy';
import { useNutrition } from '@/contexts/NutritionContext';
import { supabase } from '@/lib/supabase';
import { setPremiumWriteGate } from '@/lib/premiumWriteGate';

const REVENUECAT_ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ||
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ||
  '';
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '';
/** RevenueCat Test Store public key — required for Expo Go; never ship to stores with this. https://rev.cat/sdk-test-store */
const REVENUECAT_TEST_STORE_API_KEY =
  (process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY ?? '').trim();
const PREMIUM_ENTITLEMENT_ID = 'premium';
const ALWAYS_PREMIUM_EMAILS = new Set(['testers@dietku.com']);

function isRunningInExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

/** Play subscription IDs when offerings return no packages (override via EAS env if yours differ). */
const ANDROID_SUB_MONTHLY = (
  process.env.EXPO_PUBLIC_ANDROID_SUBSCRIPTION_MONTHLY ?? 'dietku_premium_monthly'
).trim();
const ANDROID_SUB_YEARLY = (
  process.env.EXPO_PUBLIC_ANDROID_SUBSCRIPTION_YEARLY ?? 'dietku_premium_yearly'
).trim();
/** Google Play base plan IDs (Billing v5 store product is often `subscriptionId:basePlanId`). */
const ANDROID_BASEPLAN_MONTHLY = (
  process.env.EXPO_PUBLIC_ANDROID_BASEPLAN_MONTHLY ?? 'monthly'
).trim();
const ANDROID_BASEPLAN_YEARLY = (
  process.env.EXPO_PUBLIC_ANDROID_BASEPLAN_YEARLY ?? 'tahunan'
).trim();

type RevenuePackage = any;
type OfferingsResult = any;
type CustomerInfoResult = any;

function hasPremiumEntitlement(customerInfo: CustomerInfoResult): boolean {
  const active = customerInfo?.entitlements?.active ?? {};
  return Boolean(active?.[PREMIUM_ENTITLEMENT_ID]);
}

async function fetchAndroidSubscriptionStoreProduct(
  period: 'monthly' | 'annual'
): Promise<any | null> {
  const subId = period === 'monthly' ? ANDROID_SUB_MONTHLY : ANDROID_SUB_YEARLY;
  const basePlan =
    period === 'monthly' ? ANDROID_BASEPLAN_MONTHLY : ANDROID_BASEPLAN_YEARLY;
  if (!subId) return null;
  const candidates: string[] = [];
  if (basePlan) candidates.push(`${subId}:${basePlan}`);
  candidates.push(subId);
  const unique = [...new Set(candidates)];
  const products = await Purchases.getProducts(unique, Purchases.PRODUCT_CATEGORY.SUBSCRIPTION);
  if (!products.length) return null;
  for (const id of unique) {
    const p = products.find((x: any) => x.identifier === id);
    if (p) return p;
  }
  return products[0] ?? null;
}

function getOfferingPackages(offerings: OfferingsResult): any[] {
  const current = offerings?.current;
  if (current?.availablePackages?.length) return current.availablePackages;
  const all = offerings?.all as Record<string, { availablePackages?: any[] }> | undefined;
  const fromDefault = all?.default?.availablePackages;
  if (fromDefault?.length) return fromDefault;
  const first = all ? Object.values(all).find((o) => o?.availablePackages?.length) : null;
  return first?.availablePackages ?? [];
}

/** Prefer current, then default, then any offering that has packages or dashboard monthly/annual slots. */
function getPrimaryOffering(offerings: OfferingsResult): any | null {
  if (!offerings) return null;
  const all = offerings.all as Record<string, any> | undefined;
  const hasSignals = (o: any) =>
    Boolean(
      o?.availablePackages?.length ||
        o?.monthly ||
        o?.annual ||
        o?.weekly ||
        o?.lifetime
    );
  const cur = offerings.current;
  if (cur && hasSignals(cur)) return cur;
  if (all?.default && hasSignals(all.default)) return all.default;
  if (all) {
    const withPkgs = Object.values(all).find((o) => o?.availablePackages?.length);
    if (withPkgs) return withPkgs;
    const withSlots = Object.values(all).find((o) => o?.monthly || o?.annual);
    if (withSlots) return withSlots;
  }
  return cur ?? all?.default ?? null;
}

function subscriptionPeriodBucket(pkg: any): 'monthly' | 'annual' | null {
  const p = pkg?.product?.subscriptionPeriod;
  if (p === 'P1M') return 'monthly';
  if (p === 'P1Y') return 'annual';
  return null;
}

function pickMonthlyAndAnnualPackages(offerings: OfferingsResult) {
  const primary = getPrimaryOffering(offerings);
  const fromPrimary = primary?.availablePackages ?? [];
  const fromFallback = getOfferingPackages(offerings);
  const available =
    fromPrimary.length > 0 ? fromPrimary : fromFallback.length > 0 ? fromFallback : fromPrimary;

  const type = (pkg: any) => String(pkg?.packageType ?? '').toUpperCase();
  const ident = (pkg: any) => String(pkg?.identifier ?? '').toLowerCase();

  let monthly = primary?.monthly ?? null;
  let annual = primary?.annual ?? null;

  if (!monthly) {
    monthly =
      available.find((pkg: any) => type(pkg) === 'MONTHLY') ||
      available.find((pkg: any) => ident(pkg) === '$rc_monthly') ||
      available.find((pkg: any) => subscriptionPeriodBucket(pkg) === 'monthly') ||
      null;
  }
  if (!annual) {
    annual =
      available.find((pkg: any) => type(pkg) === 'ANNUAL') ||
      available.find((pkg: any) => ident(pkg) === '$rc_annual') ||
      available.find((pkg: any) => subscriptionPeriodBucket(pkg) === 'annual') ||
      null;
  }

  // Custom package types in RevenueCat (wrong slot) but standard store products still work
  if (!monthly) {
    monthly =
      available.find(
        (pkg: any) =>
          ident(pkg).includes('monthly') || ident(pkg).includes('month') || ident(pkg).includes('bulan')
      ) || null;
  }
  if (!annual) {
    annual =
      available.find(
        (pkg: any) =>
          ident(pkg).includes('annual') ||
          ident(pkg).includes('year') ||
          ident(pkg).includes('tahun')
      ) || null;
  }

  return { monthly, annual };
}

async function syncPremiumToBackend(userId: string, premium: boolean, source = 'revenuecat') {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return;

  await callAIProxy('subscription-sync', {
    userId,
    isPremium: premium,
    source,
    accessToken,
  });
}

export const [SubscriptionProvider, useSubscription] = createContextHook(() => {
  const { authState, referralTrialEndsAt } = useNutrition();
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  /** RevenueCat entitlement only */
  const [rcPremium, setRcPremium] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallDismissible, setPaywallDismissible] = useState(true);
  const [paywallReason, setPaywallReason] = useState<string | null>(null);
  const [offerings, setOfferings] = useState<OfferingsResult | null>(null);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  /** After logIn/logOut + getCustomerInfo; used to avoid syncing false before RC reflects this user (wipes Supabase gold / bypass). */
  const premiumSyncUserIdRef = useRef<string | null>(null);

  const allowlistPremium = useMemo(() => {
    const emails = parsePremiumEmailAllowlist();
    const email = (authState.email ?? '').toLowerCase();
    return email.length > 0 && (emails.has(email) || ALWAYS_PREMIUM_EMAILS.has(email));
  }, [authState.email]);

  const referralTrialActive = useMemo(() => {
    if (!referralTrialEndsAt) return false;
    return new Date(referralTrialEndsAt).getTime() > Date.now();
  }, [referralTrialEndsAt]);

  const isPremium = rcPremium || allowlistPremium || referralTrialActive;
  setPremiumWriteGate(isPremium);

  useEffect(() => {
    if (!authState.userId) return;

    const unlocked = rcPremium || allowlistPremium || referralTrialActive;
    // Do not clear server-side premium / community gold when we cannot know (no RC in build).
    if (!unlocked && !isConfigured && !allowlistPremium && !referralTrialActive) return;
    // Do not clear until RevenueCat has refreshed for this Supabase user (prevents race before logIn finishes).
    if (!unlocked && isConfigured && premiumSyncUserIdRef.current !== authState.userId) return;

    const source = rcPremium
      ? 'revenuecat'
      : allowlistPremium
        ? 'email_allowlist'
        : referralTrialActive
          ? 'referral_trial'
          : 'revenuecat';
    let cancelled = false;
    (async () => {
      try {
        setSyncBusy(true);
        await syncPremiumToBackend(authState.userId!, unlocked, source);
      } catch {
        // non-fatal
      } finally {
        if (!cancelled) setSyncBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authState.userId, rcPremium, allowlistPremium, referralTrialActive, isConfigured]);

  const refreshSubscription = useCallback(async () => {
    if (!isConfigured) return;

    try {
      const [nextOfferings, customerInfo] = await Promise.all([
        Purchases.getOfferings(),
        Purchases.getCustomerInfo(),
      ]);
      setOfferings(nextOfferings);
      setRcPremium(hasPremiumEntitlement(customerInfo));

      if (__DEV__) {
        try {
          const rcUserId = await Purchases.getAppUserID();
          console.log(
            '[RevenueCat] Paste this into dashboard → Customers search:',
            rcUserId,
            '| premium entitlement:',
            hasPremiumEntitlement(customerInfo)
          );
        } catch {
          // non-fatal
        }
      }

      if (__DEV__) {
        const primary = getPrimaryOffering(nextOfferings);
        const pkgs = getOfferingPackages(nextOfferings);
        if (!primary?.monthly && !primary?.annual && !pkgs.length) {
          console.warn('[RevenueCat] No packages on offering:', {
            currentId: nextOfferings?.current?.identifier ?? null,
            primaryId: primary?.identifier ?? null,
            allKeys: nextOfferings?.all ? Object.keys(nextOfferings.all) : [],
            availableCount: pkgs.length,
          });
        }
      }
    } catch (error) {
      console.warn('Failed to refresh subscription:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured]);

  useEffect(() => {
    let mounted = true;

    async function configurePurchases() {
      if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
        if (mounted) {
          setIsConfigured(false);
          setIsLoading(false);
        }
        return;
      }

      const expoGo = isRunningInExpoGo();
      const apiKey = expoGo
        ? REVENUECAT_TEST_STORE_API_KEY
        : Platform.OS === 'ios'
          ? REVENUECAT_IOS_API_KEY.trim()
          : REVENUECAT_ANDROID_API_KEY.trim();

      if (!apiKey) {
        if (expoGo) {
          console.warn(
            'RevenueCat (Expo Go): add EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY from RevenueCat → Apps & providers → Test configuration → Test Store. iOS/Android SDK keys do not work in Expo Go. https://rev.cat/sdk-test-store'
          );
        } else {
          console.warn(
            Platform.OS === 'ios'
              ? 'RevenueCat is not configured: EXPO_PUBLIC_REVENUECAT_IOS_API_KEY missing'
              : 'RevenueCat is not configured: EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY (or EXPO_PUBLIC_REVENUECAT_API_KEY) missing'
          );
        }
        if (mounted) {
          setIsConfigured(false);
          setIsLoading(false);
        }
        return;
      }

      if (__DEV__ && expoGo) {
        console.log('[RevenueCat] Using Test Store API key (Expo Go).');
      }

      try {
        await Purchases.setLogLevel(__DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.WARN);
        await Purchases.configure({
          apiKey,
        });
        if (!mounted) return;
        setIsConfigured(true);
      } catch (error) {
        console.warn('Failed to configure RevenueCat:', error);
        if (mounted) {
          setIsConfigured(false);
          setIsLoading(false);
        }
      }
    }

    configurePurchases();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isConfigured) return;

    async function handleIdentity() {
      try {
        if (authState.userId) {
          await Purchases.logIn(authState.userId);
        } else {
          await Purchases.logOut();
        }
      } catch (error) {
        console.warn('Failed to sync RevenueCat user identity:', error);
      } finally {
        await refreshSubscription();
        premiumSyncUserIdRef.current = authState.userId ?? null;
      }
    }

    handleIdentity();
  }, [authState.userId, isConfigured, refreshSubscription]);

  const { monthlyPackage, annualPackage } = useMemo(() => {
    const pkg = pickMonthlyAndAnnualPackages(offerings);
    return {
      monthlyPackage: pkg.monthly,
      annualPackage: pkg.annual,
    };
  }, [offerings]);

  const openPaywall = useCallback(
    (reason?: string, opts?: { dismissible?: boolean }) => {
      setPaywallReason(reason || null);
      setPaywallDismissible(opts?.dismissible !== false);
      setShowPaywall(true);
      void refreshSubscription();
    },
    [refreshSubscription]
  );

  const closePaywall = useCallback(() => {
    if (!paywallDismissible) return;
    setShowPaywall(false);
  }, [paywallDismissible]);

  const finalizePurchaseCustomerInfo = useCallback(
    async (customerInfo: CustomerInfoResult | undefined) => {
      let premium = hasPremiumEntitlement(customerInfo);
      if (!premium) {
        try {
          const synced = await Purchases.syncPurchasesForResult();
          premium = hasPremiumEntitlement(synced.customerInfo);
        } catch {
          // non-fatal
        }
      }
      setRcPremium(premium);
      if (premium) {
        setShowPaywall(false);
        Alert.alert('Berhasil', 'Langganan Premium aktif.');
      } else {
        Alert.alert(
          'Premium belum terdeteksi',
          'Jika pembayaran sudah berhasil, tunggu 1–2 menit lalu ketuk Pulihkan Pembelian.'
        );
      }
      return premium;
    },
    []
  );

  const purchasePackage = useCallback(
    async (pkg: RevenuePackage | null) => {
      if (!pkg) return false;
      try {
        setPurchaseBusy(true);
        const result = await Purchases.purchasePackage(pkg);
        return finalizePurchaseCustomerInfo(result?.customerInfo);
      } catch (error: any) {
        if (!error?.userCancelled) {
          Alert.alert('Pembelian gagal', 'Silakan coba lagi.');
        }
        return false;
      } finally {
        setPurchaseBusy(false);
      }
    },
    [finalizePurchaseCustomerInfo]
  );

  /** When offerings have no packages, buy by Play product id (still goes through RevenueCat). */
  const purchaseAndroidSubscriptionByProductId = useCallback(
    async (period: 'monthly' | 'annual') => {
      const productId = period === 'monthly' ? ANDROID_SUB_MONTHLY : ANDROID_SUB_YEARLY;
      if (!productId) {
        Alert.alert(
          'Paket belum tersedia',
          'Tambahkan EXPO_PUBLIC_ANDROID_SUBSCRIPTION_MONTHLY dan YEARLY di EAS (production), atau perbaiki Offering + produk di RevenueCat.'
        );
        return false;
      }
      if (!isConfigured) {
        Alert.alert(
          'Pembayaran belum siap',
          'Kunci RevenueCat Android belum ada di build ini. Set EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY di EAS production lalu build ulang.'
        );
        return false;
      }
      try {
        setPurchaseBusy(true);
        const storeProduct = await fetchAndroidSubscriptionStoreProduct(period);
        if (!storeProduct) {
          Alert.alert(
            'Produk Play belum tersedia',
            'Google Play belum mengembalikan langganan ini. Pasang app dari Internal/Open testing, pastikan akun Google adalah tester, dan cek ID + base plan di Play Console (contoh: dietku_premium_monthly + base plan monthly).'
          );
          return false;
        }
        const result = await Purchases.purchaseStoreProduct(storeProduct);
        return finalizePurchaseCustomerInfo(result?.customerInfo);
      } catch (error: any) {
        if (!error?.userCancelled) {
          Alert.alert('Pembelian gagal', 'Silakan coba lagi.');
        }
        return false;
      } finally {
        setPurchaseBusy(false);
      }
    },
    [isConfigured, finalizePurchaseCustomerInfo]
  );

  const purchaseMonthly = useCallback(async () => {
    if (monthlyPackage) return purchasePackage(monthlyPackage);
    if (Platform.OS === 'android') return purchaseAndroidSubscriptionByProductId('monthly');
    Alert.alert(
      'Paket belum tersedia',
      'Tidak ada paket bulanan dari RevenueCat. Periksa Offering di dashboard (iOS).'
    );
    return false;
  }, [monthlyPackage, purchasePackage, purchaseAndroidSubscriptionByProductId]);

  const purchaseAnnual = useCallback(async () => {
    if (annualPackage) return purchasePackage(annualPackage);
    if (Platform.OS === 'android') return purchaseAndroidSubscriptionByProductId('annual');
    Alert.alert(
      'Paket belum tersedia',
      'Tidak ada paket tahunan dari RevenueCat. Periksa Offering di dashboard (iOS).'
    );
    return false;
  }, [annualPackage, purchasePackage, purchaseAndroidSubscriptionByProductId]);

  const restorePurchases = useCallback(async () => {
    try {
      setPurchaseBusy(true);
      const customerInfo = await Purchases.restorePurchases();
      const premium = hasPremiumEntitlement(customerInfo);
      setRcPremium(premium);
      Alert.alert(
        premium ? 'Berhasil' : 'Tidak ada pembelian',
        premium ? 'Premium berhasil dipulihkan.' : 'Tidak ada langganan aktif untuk dipulihkan.'
      );
      return premium;
    } catch (error) {
      Alert.alert('Gagal memulihkan', 'Silakan coba lagi.');
      return false;
    } finally {
      setPurchaseBusy(false);
    }
  }, [authState.userId]);

  return {
    isConfigured,
    isLoading,
    isPremium,
    purchaseBusy,
    syncBusy,
    showPaywall,
    paywallDismissible,
    paywallReason,
    monthlyPackage,
    annualPackage,
    openPaywall,
    closePaywall,
    purchaseMonthly,
    purchaseAnnual,
    restorePurchases,
    refreshSubscription,
  };
});
