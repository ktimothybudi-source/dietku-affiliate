import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { X, Crown } from 'lucide-react-native';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  SUBSCRIPTION_MONTHLY_IDR_FALLBACK,
  SUBSCRIPTION_YEARLY_IDR_FALLBACK,
  SUBSCRIPTION_YEARLY_EQUIV_MONTHLY_ROUNDED,
  SUBSCRIPTION_YEARLY_SAVINGS_PCT_VS_MONTHLY,
} from '@/lib/subscriptionPricing';
import PaywallReferralSection from '@/components/PaywallReferralSection';

export default function PremiumPaywallModal() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const {
    showPaywall,
    paywallDismissible,
    paywallReason,
    closePaywall,
    purchaseMonthly,
    purchaseAnnual,
    restorePurchases,
    purchaseBusy,
    monthlyPackage,
    annualPackage,
  } = useSubscription();

  const monthlyStr =
    (monthlyPackage as { product?: { priceString?: string } } | null)?.product?.priceString ??
    SUBSCRIPTION_MONTHLY_IDR_FALLBACK;
  const annualStr =
    (annualPackage as { product?: { priceString?: string } } | null)?.product?.priceString ??
    SUBSCRIPTION_YEARLY_IDR_FALLBACK;
  const equivLabel = `Setara ~Rp ${SUBSCRIPTION_YEARLY_EQUIV_MONTHLY_ROUNDED.toLocaleString('id-ID')}/bulan`;

  return (
    <Modal
      visible={showPaywall}
      transparent
      animationType="slide"
      onRequestClose={paywallDismissible ? closePaywall : () => {}}
    >
      <View style={styles.container}>
        <Pressable
          style={styles.overlay}
          onPress={paywallDismissible ? closePaywall : undefined}
        />
        <View style={[styles.sheet, { backgroundColor: theme.card }]}>
          <View style={styles.header}>
            <View style={[styles.badge, { backgroundColor: `${theme.primary}20` }]}>
              <Crown size={18} color={theme.primary} />
              <Text style={[styles.badgeText, { color: theme.primary }]}>Akses penuh</Text>
            </View>
            {paywallDismissible ? (
              <TouchableOpacity onPress={closePaywall} accessibilityLabel="Tutup">
                <X size={22} color={theme.textSecondary} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 22 }} />
            )}
          </View>

          <Text style={[styles.title, { color: theme.text }]}>DietKu</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Akses penuh macro, micro, air, Kemajuan, dan scan tanpa batas.
          </Text>
          <View
            style={[
              styles.motivationBox,
              { backgroundColor: `${theme.primary}14`, borderColor: `${theme.primary}40` },
            ]}
          >
            <Text style={[styles.motivationTitle, { color: theme.text }]}>
              Investasi terbaik? Dirimu sendiri.
            </Text>
            <Text style={[styles.motivationSub, { color: theme.textSecondary }]}>
              Langganan mendukung kebiasaan sehatmu setiap hari — tanpa batas, tanpa kompromi.
            </Text>
          </View>
          <Image source={require('@/assets/images/subscription.jpg')} style={styles.heroImage} resizeMode="cover" />
          {paywallReason ? (
            <Text style={[styles.reason, { color: theme.textTertiary }]}>{paywallReason}</Text>
          ) : null}

          <PaywallReferralSection
            variant="themed"
            textPrimary={theme.text}
            textSecondary={theme.textSecondary}
            borderColor={theme.border}
            inputBg={theme.background}
            accentColor={theme.primary}
          />

          <TouchableOpacity
            style={[styles.planButton, { borderColor: theme.border, backgroundColor: theme.background }]}
            onPress={purchaseMonthly}
            disabled={purchaseBusy}
            activeOpacity={0.85}
          >
            <View>
              <Text style={[styles.planTitle, { color: theme.text }]}>{t.subscription.monthly}</Text>
              <Text style={[styles.planSub, { color: theme.textSecondary }]}>{monthlyStr}</Text>
              <Text style={[styles.equiv, { color: theme.textTertiary }]}>Penagihan setiap bulan</Text>
            </View>
            {purchaseBusy ? <ActivityIndicator color={theme.primary} /> : null}
          </TouchableOpacity>

          <View
            style={[
              styles.planButton,
              styles.recommended,
              { borderColor: theme.primary, backgroundColor: `${theme.primary}12` },
            ]}
          >
            <View style={styles.popularBadge}>
              <Text style={[styles.popularBadgeText, { color: theme.primary }]}>Paling populer</Text>
            </View>
            <TouchableOpacity
              style={styles.planTouchable}
              onPress={purchaseAnnual}
              disabled={purchaseBusy}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.planTitle, { color: theme.text }]}>{t.subscription.yearly}</Text>
                <Text style={[styles.planSub, { color: theme.textSecondary }]}>{annualStr}</Text>
                <Text style={[styles.equiv, { color: theme.textTertiary }]}>{equivLabel}</Text>
                <Text style={[styles.savings, { color: theme.primary }]}>
                  Hemat {SUBSCRIPTION_YEARLY_SAVINGS_PCT_VS_MONTHLY}% dibanding bulanan
                </Text>
                <Text style={[styles.trialLead, { color: theme.primary }]}>{t.subscription.annualTrialLead}</Text>
                <Text style={[styles.trialLine, { color: theme.textTertiary }]}>
                  {t.subscription.annualTrialDetail}
                </Text>
              </View>
              {purchaseBusy ? <ActivityIndicator color={theme.primary} /> : null}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={restorePurchases} disabled={purchaseBusy} style={styles.restoreButton}>
            <Text style={[styles.restoreText, { color: theme.primary }]}>Pulihkan Pembelian</Text>
          </TouchableOpacity>

          <Text style={[styles.footnote, { color: theme.textTertiary }]}>{t.subscription.trial}</Text>
          <Text style={[styles.footnote, { color: theme.textTertiary, marginTop: 4 }]}>
            Langganan diperpanjang otomatis kecuali dibatalkan minimal 24 jam sebelum periode berakhir.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    gap: 12,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '800' },
  heroImage: {
    width: '100%',
    height: 110,
    borderRadius: 14,
    marginTop: 4,
  },
  subtitle: { fontSize: 14, lineHeight: 20 },
  motivationBox: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 4,
    marginBottom: 4,
  },
  motivationTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  motivationSub: { fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 6, lineHeight: 18 },
  reason: { fontSize: 12 },
  planButton: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recommended: {
    borderWidth: 1.5,
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  popularBadge: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  popularBadgeText: { fontSize: 11, fontWeight: '800' },
  planTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  planTitle: { fontSize: 16, fontWeight: '700' },
  planSub: { marginTop: 2, fontSize: 13 },
  equiv: { marginTop: 4, fontSize: 12 },
  savings: { marginTop: 4, fontSize: 12, fontWeight: '700' },
  trialLead: { marginTop: 8, fontSize: 13, fontWeight: '700' },
  trialLine: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  restoreButton: { paddingVertical: 10, alignItems: 'center' },
  restoreText: { fontSize: 14, fontWeight: '700' },
  footnote: { fontSize: 12, lineHeight: 18 },
});
