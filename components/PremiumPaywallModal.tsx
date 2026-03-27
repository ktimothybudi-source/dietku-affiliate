import React from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { X, Crown } from 'lucide-react-native';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTheme } from '@/contexts/ThemeContext';

export default function PremiumPaywallModal() {
  const { theme } = useTheme();
  const {
    showPaywall,
    paywallReason,
    closePaywall,
    purchaseMonthly,
    purchaseAnnual,
    restorePurchases,
    purchaseBusy,
  } = useSubscription();

  return (
    <Modal visible={showPaywall} transparent animationType="slide" onRequestClose={closePaywall}>
      <View style={styles.container}>
        <Pressable style={styles.overlay} onPress={closePaywall} />
        <View style={[styles.sheet, { backgroundColor: theme.card }]}>
          <View style={styles.header}>
            <View style={[styles.badge, { backgroundColor: `${theme.primary}20` }]}>
              <Crown size={18} color={theme.primary} />
              <Text style={[styles.badgeText, { color: theme.primary }]}>Premium</Text>
            </View>
            <TouchableOpacity onPress={closePaywall}>
              <X size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: theme.text }]}>Upgrade ke DietKu Premium</Text>
          <Image source={require('@/assets/images/subscription.jpg')} style={styles.heroImage} resizeMode="cover" />
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Buka akses penuh macro, micro, air, statistik Kemajuan, dan scan tanpa batas.
          </Text>
          {paywallReason ? (
            <Text style={[styles.reason, { color: theme.textTertiary }]}>{paywallReason}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.planButton, { borderColor: theme.border, backgroundColor: theme.background }]}
            onPress={purchaseMonthly}
            disabled={purchaseBusy}
          >
            <View>
              <Text style={[styles.planTitle, { color: theme.text }]}>Premium Bulanan</Text>
              <Text style={[styles.planSub, { color: theme.textSecondary }]}>IDR 129.000 / bulan</Text>
            </View>
            {purchaseBusy ? <ActivityIndicator color={theme.primary} /> : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.planButton, styles.recommended, { borderColor: theme.primary, backgroundColor: `${theme.primary}12` }]}
            onPress={purchaseAnnual}
            disabled={purchaseBusy}
          >
            <View>
              <Text style={[styles.planTitle, { color: theme.text }]}>Premium Tahunan</Text>
              <Text style={[styles.planSub, { color: theme.textSecondary }]}>IDR 399.000 / tahun</Text>
            </View>
            {purchaseBusy ? <ActivityIndicator color={theme.primary} /> : null}
          </TouchableOpacity>

          <TouchableOpacity onPress={restorePurchases} disabled={purchaseBusy} style={styles.restoreButton}>
            <Text style={[styles.restoreText, { color: theme.primary }]}>Pulihkan Pembelian</Text>
          </TouchableOpacity>

          <Text style={[styles.footnote, { color: theme.textTertiary }]}>
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
  },
  planTitle: { fontSize: 16, fontWeight: '700' },
  planSub: { marginTop: 2, fontSize: 13 },
  restoreButton: { paddingVertical: 10, alignItems: 'center' },
  restoreText: { fontSize: 14, fontWeight: '700' },
  footnote: { fontSize: 12, lineHeight: 18 },
});
