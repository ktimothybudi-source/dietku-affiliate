import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  Modal,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanLine, Apple, BarChart3 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useNutrition } from '@/contexts/NutritionContext';
import { supabase } from '@/lib/supabase';
import {
  SUBSCRIPTION_MONTHLY_IDR_FALLBACK,
  SUBSCRIPTION_YEARLY_IDR_FALLBACK,
  SUBSCRIPTION_YEARLY_EQUIV_MONTHLY_ROUNDED,
  SUBSCRIPTION_YEARLY_SAVINGS_PCT_VS_MONTHLY,
} from '@/lib/subscriptionPricing';
import PaywallReferralSection from '@/components/PaywallReferralSection';
import { peekPendingReferralCode } from '@/lib/pendingReferralCode';

type BillingPeriod = 'yearly' | 'monthly';

const PAYWALL_BG = '#FFFFFF';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#6B7280';
const ACCENT = '#22C55E';

const equivMonthlyDisplay = `Rp ${SUBSCRIPTION_YEARLY_EQUIV_MONTHLY_ROUNDED.toLocaleString('id-ID')} / bulan`;

export default function SubscribeScreen() {
  const params = useLocalSearchParams<{ ref?: string | string[] }>();
  const refParam = typeof params.ref === 'string' ? params.ref : params.ref?.[0] ?? null;
  const insets = useSafeAreaInsets();
  const { authState } = useNutrition();
  const {
    isPremium,
    purchaseMonthly,
    purchaseAnnual,
    restorePurchases,
    purchaseBusy,
    monthlyPackage,
    annualPackage,
    refreshSubscription,
    isLoading: subscriptionLoading,
  } = useSubscription();

  const [billing, setBilling] = useState<BillingPeriod>('yearly');
  const [referralModalOpen, setReferralModalOpen] = useState(false);

  useEffect(() => {
    void refreshSubscription();
  }, [refreshSubscription]);

  useEffect(() => {
    if (isPremium) {
      router.replace('/(tabs)');
    }
  }, [isPremium]);

  /** Open referral sheet when deep link or stashed code exists */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = await peekPendingReferralCode();
      if (cancelled) return;
      if (refParam?.trim() || pending?.trim()) setReferralModalOpen(true);
    })();
  }, [refParam]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (router.canGoBack()) {
          router.back();
        }
        return true;
      });
      return () => sub.remove();
    }, [])
  );

  const monthlyStr =
    (monthlyPackage as { product?: { priceString?: string } } | null)?.product?.priceString ??
    SUBSCRIPTION_MONTHLY_IDR_FALLBACK;
  const annualStr =
    (annualPackage as { product?: { priceString?: string } } | null)?.product?.priceString ??
    SUBSCRIPTION_YEARLY_IDR_FALLBACK;

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await supabase.auth.signOut();
      router.replace('/sign-in');
    } catch {
      Alert.alert('Error', 'Gagal keluar. Coba lagi.');
    }
  };

  const startTrial = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (billing === 'yearly') await purchaseAnnual();
    else await purchaseMonthly();
  };

  const savingsPct = SUBSCRIPTION_YEARLY_SAVINGS_PCT_VS_MONTHLY;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.root, { backgroundColor: PAYWALL_BG }]}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 100,
            paddingHorizontal: 22,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.brandMark}>DietKu</Text>

          <Image
            source={require('@/assets/images/subscription.jpg')}
            style={styles.hero}
            resizeMode="cover"
          />

          <Text style={styles.headline}>Jadikan 2026 tahun kamu akhirnya konsisten</Text>
          <Text style={styles.subheadline}>
            Semua yang kamu butuhkan untuk hidup lebih sehat dan konsisten, dalam satu aplikasi.
          </Text>

          <TouchableOpacity
            style={[styles.primaryCta, { opacity: purchaseBusy ? 0.65 : 1 }]}
            onPress={startTrial}
            disabled={purchaseBusy}
            activeOpacity={0.88}
          >
            {purchaseBusy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryCtaText}>
                {billing === 'yearly'
                  ? 'Mulai gratis 3 hari'
                  : `Berlangganan ${monthlyStr} per bulan`}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.ctaFinePrint}>
            {billing === 'yearly'
              ? 'Tanpa komitmen • Bisa batal kapan saja'
              : 'Tanpa trial gratis • Penagihan dimulai setelah konfirmasi • Bisa batal kapan saja'}
          </Text>

          {subscriptionLoading ? (
            <ActivityIndicator size="small" color={ACCENT} style={{ marginTop: 20 }} />
          ) : null}

          <Text style={styles.sectionLabel}>Pilih paket</Text>

          <View style={styles.toggleTrack}>
            <TouchableOpacity
              style={[
                styles.toggleSeg,
                billing === 'yearly' ? styles.toggleSegYearlyOn : null,
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                setBilling('yearly');
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, billing === 'yearly' && styles.toggleTextOn]}>
                Tahunan (Hemat {savingsPct}%)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleSeg, billing === 'monthly' && styles.toggleSegOn]}
              onPress={() => {
                Haptics.selectionAsync();
                setBilling('monthly');
              }}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, billing === 'monthly' && styles.toggleTextOn]}>Bulanan</Text>
            </TouchableOpacity>
          </View>

          {billing === 'yearly' ? (
            <View style={styles.yearlyCard}>
              <View style={styles.popularBadge}>
                <Text style={styles.popularBadgeText}>Paling populer</Text>
              </View>
              <Text style={styles.priceHeroYearly}>{equivMonthlyDisplay}</Text>
              <Text style={styles.priceSubYearly}>Ditagih {annualStr} / tahun</Text>
              <Text style={styles.savingsLine}>
                Hemat {savingsPct}% dibanding bayar bulanan setahun penuh
              </Text>
              <Text style={styles.trialHint}>Mulai gratis 3 hari berlaku untuk paket tahunan</Text>
            </View>
          ) : (
            <View style={styles.priceBlock}>
              <Text style={styles.priceHero}>{monthlyStr} / bulan</Text>
              <Text style={styles.priceSub}>Ditagih setiap bulan</Text>
              <Text style={styles.monthlyVsYearlyHint}>Paket tahunan jauh lebih hemat — tap Tahunan di atas</Text>
            </View>
          )}

          <View style={styles.benefits}>
            <View style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <ScanLine size={20} color={ACCENT} strokeWidth={2.2} />
              </View>
              <Text style={styles.benefitText}>Scan makanan otomatis</Text>
            </View>
            <View style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Apple size={20} color={ACCENT} strokeWidth={2.2} />
              </View>
              <Text style={styles.benefitText}>Rencana diet personal</Text>
            </View>
            <View style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <BarChart3 size={20} color={ACCENT} strokeWidth={2.2} />
              </View>
              <Text style={styles.benefitText}>Tracking kalori simpel</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.linkBtn}
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              await restorePurchases();
            }}
            disabled={purchaseBusy}
          >
            <Text style={styles.linkBtnLabel}>Sudah berlangganan? Pulihkan pembelian</Text>
          </TouchableOpacity>

          {authState.isSignedIn ? (
            <TouchableOpacity style={styles.linkBtn} onPress={handleSignOut} disabled={purchaseBusy}>
              <Text style={[styles.linkBtnLabel, { color: TEXT_SECONDARY }]}>Keluar</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.legalFooter}>
            {billing === 'yearly'
              ? 'Langganan diperpanjang otomatis kecuali dibatalkan minimal 24 jam sebelum periode berakhir. Percobaan gratis 3 hari untuk paket tahunan mengikuti penawaran App Store / Google Play.'
              : 'Langganan diperpanjang otomatis kecuali dibatalkan minimal 24 jam sebelum periode berakhir. Paket bulanan ditagih langsung tanpa trial gratis sesuai toko aplikasi.'}
          </Text>
        </ScrollView>

        {/** Floating referral — does not compete with main CTA */}
        <TouchableOpacity
          style={[styles.referralFab, { bottom: insets.bottom + 20, right: 18 }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setReferralModalOpen(true);
          }}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Kode undangan"
        >
          <Text style={styles.referralFabEmoji}>🎁</Text>
        </TouchableOpacity>

        <Modal
          visible={referralModalOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setReferralModalOpen(false)}
        >
          <View style={styles.modalWrap}>
            <Pressable style={styles.modalBackdrop} onPress={() => setReferralModalOpen(false)} />
            <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
              <View style={styles.modalGrab} />
              <PaywallReferralSection
                variant="light"
                forModal
                onModalClose={() => setReferralModalOpen(false)}
                consumePendingOnMount={referralModalOpen}
                deepLinkRef={refParam}
                textPrimary={TEXT_PRIMARY}
                textSecondary={TEXT_SECONDARY}
                borderColor="#E5E7EB"
                inputBg="#F9FAFB"
                accentColor={ACCENT}
              />
            </View>
          </View>
        </Modal>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  brandMark: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 16,
  },
  hero: {
    width: '100%',
    height: 220,
    borderRadius: 20,
    marginBottom: 24,
    backgroundColor: '#F3F4F6',
  },
  headline: {
    fontSize: 26,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    lineHeight: 32,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  subheadline: {
    fontSize: 16,
    fontWeight: '400',
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  primaryCta: {
    backgroundColor: ACCENT,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryCtaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  ctaFinePrint: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 10,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT_SECONDARY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 28,
    marginBottom: 10,
  },
  toggleTrack: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  toggleSeg: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleSegOn: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleSegYearlyOn: {
    borderWidth: 1.5,
    borderColor: ACCENT,
    // Solid fill avoids stacking with white + elevation (Android “square inside rounded” glitch).
    backgroundColor: '#DCFCE7',
  },
  yearlyCard: {
    borderWidth: 2,
    borderColor: ACCENT,
    borderRadius: 18,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 28,
    alignItems: 'center',
  },
  popularBadge: {
    alignSelf: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  popularBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.2,
  },
  priceHeroYearly: {
    fontSize: 30,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.9,
    textAlign: 'center',
  },
  priceSubYearly: {
    fontSize: 15,
    fontWeight: '500',
    color: TEXT_SECONDARY,
    marginTop: 8,
    textAlign: 'center',
  },
  savingsLine: {
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT,
    marginTop: 14,
    textAlign: 'center',
  },
  trialHint: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 17,
  },
  monthlyVsYearlyHint: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    textAlign: 'center',
  },
  toggleTextOn: {
    color: TEXT_PRIMARY,
    fontWeight: '700',
  },
  priceBlock: {
    alignItems: 'center',
    marginBottom: 28,
  },
  priceHero: {
    fontSize: 28,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    letterSpacing: -0.8,
  },
  priceSub: {
    fontSize: 15,
    fontWeight: '500',
    color: TEXT_SECONDARY,
    marginTop: 6,
  },
  benefits: { gap: 14, marginBottom: 28 },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    flex: 1,
  },
  linkBtn: { paddingVertical: 12, alignItems: 'center' },
  linkBtnLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: ACCENT,
  },
  legalFooter: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 12,
  },
  referralFab: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  referralFabEmoji: { fontSize: 24 },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    backgroundColor: PAYWALL_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  modalGrab: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    alignSelf: 'center',
    marginBottom: 18,
  },
});
