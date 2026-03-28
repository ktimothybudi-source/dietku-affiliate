import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
import { Alert, Platform } from 'react-native';
import Purchases from 'react-native-purchases';
import { callAIProxy } from '@/utils/aiProxy';
import { useNutrition } from '@/contexts/NutritionContext';
import { supabase } from '@/lib/supabase';

const REVENUECAT_ANDROID_API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ||
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ||
  '';
const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY || '';
const PREMIUM_ENTITLEMENT_ID = 'premium';

type RevenuePackage = any;
type OfferingsResult = any;
type CustomerInfoResult = any;

function hasPremiumEntitlement(customerInfo: CustomerInfoResult): boolean {
  const active = customerInfo?.entitlements?.active ?? {};
  return Boolean(active?.[PREMIUM_ENTITLEMENT_ID]);
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

function pickMonthlyAndAnnualPackages(offerings: OfferingsResult) {
  const available = getOfferingPackages(offerings);
  const type = (pkg: any) => String(pkg?.packageType ?? '').toUpperCase();
  const ident = (pkg: any) => String(pkg?.identifier ?? '').toLowerCase();

  let monthly =
    available.find((pkg: any) => type(pkg) === 'MONTHLY') ||
    available.find((pkg: any) => ident(pkg) === '$rc_monthly') ||
    null;
  let annual =
    available.find((pkg: any) => type(pkg) === 'ANNUAL') ||
    available.find((pkg: any) => ident(pkg) === '$rc_annual') ||
    null;

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
  const { authState } = useNutrition();
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  /** RevenueCat entitlement only */
  const [rcPremium, setRcPremium] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string | null>(null);
  const [offerings, setOfferings] = useState<OfferingsResult | null>(null);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  const allowlistPremium = useMemo(() => {
    const emails = parsePremiumEmailAllowlist();
    const email = (authState.email ?? '').toLowerCase();
    return email.length > 0 && emails.has(email);
  }, [authState.email]);

  const isPremium = rcPremium || allowlistPremium;

  useEffect(() => {
    if (!authState.userId) return;
    const unlocked = rcPremium || allowlistPremium;
    const source =
      !unlocked ? 'revenuecat' : allowlistPremium && !rcPremium ? 'email_allowlist' : 'revenuecat';
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
  }, [authState.userId, rcPremium, allowlistPremium]);

  const refreshSubscription = useCallback(async () => {
    if (!isConfigured) return;

    try {
      const [nextOfferings, customerInfo] = await Promise.all([
        Purchases.getOfferings(),
        Purchases.getCustomerInfo(),
      ]);
      setOfferings(nextOfferings);
      setRcPremium(hasPremiumEntitlement(customerInfo));
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

      const apiKey =
        Platform.OS === 'ios' ? REVENUECAT_IOS_API_KEY.trim() : REVENUECAT_ANDROID_API_KEY.trim();

      if (!apiKey) {
        console.warn(
          Platform.OS === 'ios'
            ? 'RevenueCat is not configured: EXPO_PUBLIC_REVENUECAT_IOS_API_KEY missing'
            : 'RevenueCat is not configured: EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY (or EXPO_PUBLIC_REVENUECAT_API_KEY) missing'
        );
        if (mounted) {
          setIsConfigured(false);
          setIsLoading(false);
        }
        return;
      }

      try {
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

  const openPaywall = useCallback((reason?: string) => {
    setPaywallReason(reason || null);
    setShowPaywall(true);
  }, []);

  const closePaywall = useCallback(() => {
    setShowPaywall(false);
  }, []);

  const purchasePackage = useCallback(
    async (pkg: RevenuePackage | null) => {
      if (!pkg) {
        Alert.alert(
          'Paket belum tersedia',
          'RevenueCat tidak menemukan paket bulanan/tahunan. Periksa Offering (current/default) dan paket Monthly/Annual di dashboard, pastikan AAB dari Play internal testing, dan EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ada di EAS production.'
        );
        return false;
      }
      try {
        setPurchaseBusy(true);
        const result = await Purchases.purchasePackage(pkg);
        const premium = hasPremiumEntitlement(result?.customerInfo);
        setRcPremium(premium);
        if (premium) {
          setShowPaywall(false);
          Alert.alert('Berhasil', 'Langganan Premium aktif.');
        }
        return premium;
      } catch (error: any) {
        if (!error?.userCancelled) {
          Alert.alert('Pembelian gagal', 'Silakan coba lagi.');
        }
        return false;
      } finally {
        setPurchaseBusy(false);
      }
    },
    [authState.userId]
  );

  const purchaseMonthly = useCallback(async () => {
    return purchasePackage(monthlyPackage);
  }, [monthlyPackage, purchasePackage]);

  const purchaseAnnual = useCallback(async () => {
    return purchasePackage(annualPackage);
  }, [annualPackage, purchasePackage]);

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
