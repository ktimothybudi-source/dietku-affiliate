import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

function pickMonthlyAndAnnualPackages(offerings: OfferingsResult) {
  const available = offerings?.current?.availablePackages ?? [];
  const monthly =
    available.find((pkg: any) => String(pkg?.packageType).toUpperCase() === 'MONTHLY') || null;
  const annual =
    available.find((pkg: any) => String(pkg?.packageType).toUpperCase() === 'ANNUAL') || null;
  return { monthly, annual };
}

async function syncPremiumToBackend(userId: string, isPremium: boolean) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) return;

  await callAIProxy('subscription-sync', {
    userId,
    isPremium,
    source: 'revenuecat',
    accessToken,
  });
}

export const [SubscriptionProvider, useSubscription] = createContextHook(() => {
  const { authState } = useNutrition();
  const [isConfigured, setIsConfigured] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPremium, setIsPremium] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState<string | null>(null);
  const [offerings, setOfferings] = useState<OfferingsResult | null>(null);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  const refreshSubscription = useCallback(async () => {
    if (!isConfigured) return;

    try {
      const [nextOfferings, customerInfo] = await Promise.all([
        Purchases.getOfferings(),
        Purchases.getCustomerInfo(),
      ]);
      setOfferings(nextOfferings);
      const premium = hasPremiumEntitlement(customerInfo);
      setIsPremium(premium);

      if (authState.userId) {
        setSyncBusy(true);
        await syncPremiumToBackend(authState.userId, premium);
      }
    } catch (error) {
      console.warn('Failed to refresh subscription:', error);
    } finally {
      setSyncBusy(false);
      setIsLoading(false);
    }
  }, [authState.userId, isConfigured]);

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
        Alert.alert('Paket belum tersedia', 'Paket langganan belum tersedia di Play Console.');
        return false;
      }
      try {
        setPurchaseBusy(true);
        const result = await Purchases.purchasePackage(pkg);
        const premium = hasPremiumEntitlement(result?.customerInfo);
        setIsPremium(premium);
        if (authState.userId) {
          await syncPremiumToBackend(authState.userId, premium);
        }
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
      setIsPremium(premium);
      if (authState.userId) {
        await syncPremiumToBackend(authState.userId, premium);
      }
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
