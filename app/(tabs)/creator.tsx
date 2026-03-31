import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useNutrition } from '@/contexts/NutritionContext';
import {
  creatorEnsurePrimaryCode,
  creatorSetCodeActive,
  fetchCreatorDashboard,
  fetchCreatorHistory,
  fetchCreatorOwnedCode,
} from '@/lib/creatorReferral';
import { supabase } from '@/lib/supabase';

type CreatorProfileRow = { id: string; name: string | null; email: string | null };

export default function CreatorDashboardScreen() {
  const { theme } = useTheme();
  const { authState, isAppAdmin, isAppCreator } = useNutrition();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedCreatorId, setSelectedCreatorId] = useState<string | null>(null);
  const uid = authState.userId;
  const canAccess = isAppAdmin || isAppCreator;
  const targetCreatorId = isAppAdmin ? selectedCreatorId ?? uid : uid;

  const creatorsQuery = useQuery({
    queryKey: ['creator_profiles_admin'],
    enabled: isAppAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,name,email')
        .eq('app_role', 'creator')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as CreatorProfileRow[];
    },
  });

  const dashboardQuery = useQuery({
    queryKey: ['creator_dashboard', targetCreatorId],
    enabled: canAccess && !!targetCreatorId,
    queryFn: () => fetchCreatorDashboard(targetCreatorId),
  });

  const historyQuery = useQuery({
    queryKey: ['creator_history', targetCreatorId],
    enabled: canAccess && !!targetCreatorId,
    queryFn: () => fetchCreatorHistory(targetCreatorId, 80),
  });

  const activeCodeQuery = useQuery({
    queryKey: ['creator_active_code', targetCreatorId],
    enabled: canAccess && !!targetCreatorId,
    queryFn: () => fetchCreatorOwnedCode(String(targetCreatorId)),
  });

  const onRefresh = async () => {
    await Promise.all([
      dashboardQuery.refetch(),
      historyQuery.refetch(),
      activeCodeQuery.refetch(),
      creatorsQuery.refetch(),
    ]);
  };

  const ensureCode = async () => {
    const res = await creatorEnsurePrimaryCode();
    if (!res.ok) {
      Alert.alert('Gagal', res.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await onRefresh();
  };

  const copyCode = async () => {
    const code = dashboardQuery.data?.overview?.current_active_code;
    if (!code) return;
    try {
      // Avoid static import resolution issues; load clipboard at runtime.
      // If expo-clipboard is missing in a given build, we fall back to a friendly message.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Clipboard = require('expo-clipboard') as { setStringAsync?: (s: string) => Promise<void> };
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(code);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Alert.alert('Tersalin', `Kode ${code} sudah disalin.`);
        return;
      }
    } catch {
      // no-op: handle below
    }

    Alert.alert('Salin tidak tersedia', `Kode: ${code}`);
  };

  const toggleCode = async () => {
    if (isAppAdmin && targetCreatorId !== uid) {
      Alert.alert('Akses', 'Admin bisa toggle melalui panel admin detail kode creator.');
      return;
    }
    const code = activeCodeQuery.data;
    if (!code) return;
    const next = !code.is_active;
    const res = await creatorSetCodeActive(code.id, next);
    if (!res.ok) {
      Alert.alert('Gagal', res.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await onRefresh();
  };

  const conversionLabel = useMemo(() => {
    const pct = dashboardQuery.data?.overview?.conversion_rate_pct ?? 0;
    return `${pct.toFixed(1)}%`;
  }, [dashboardQuery.data?.overview?.conversion_rate_pct]);

  if (!canAccess) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.title, { color: theme.text }]}>Creator Dashboard</Text>
        <Text style={{ color: theme.textSecondary, textAlign: 'center', paddingHorizontal: 24 }}>
          Halaman ini hanya untuk akun creator/admin.
        </Text>
      </View>
    );
  }

  if (dashboardQuery.isLoading && !dashboardQuery.data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  const overview = dashboardQuery.data?.overview;
  const stats = dashboardQuery.data?.stats;
  const history = historyQuery.data ?? [];

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top + 8 }}>
      <FlatList
        data={history}
        keyExtractor={(item, idx) => `${item.redemption_date}-${idx}`}
        refreshControl={<RefreshControl refreshing={dashboardQuery.isFetching || historyQuery.isFetching} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 16, gap: 12, paddingBottom: 12 }}>
            <Text style={[styles.title, { color: theme.text }]}>Creator Dashboard</Text>

            {isAppAdmin ? (
              <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Filter creator (admin)</Text>
                <View style={styles.rowWrap}>
                  <TouchableOpacity
                    style={[styles.filterChip, { borderColor: theme.border, backgroundColor: !selectedCreatorId ? `${theme.primary}22` : theme.background }]}
                    onPress={() => setSelectedCreatorId(null)}
                  >
                    <Text style={{ color: !selectedCreatorId ? theme.primary : theme.textSecondary }}>Saya</Text>
                  </TouchableOpacity>
                  {(creatorsQuery.data ?? []).map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.filterChip, { borderColor: theme.border, backgroundColor: selectedCreatorId === c.id ? `${theme.primary}22` : theme.background }]}
                      onPress={() => setSelectedCreatorId(c.id)}
                    >
                      <Text style={{ color: selectedCreatorId === c.id ? theme.primary : theme.textSecondary }}>
                        {c.name?.trim() || c.email || c.id.slice(0, 6)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Overview</Text>
              <Text style={{ color: theme.textSecondary }}>Kode aktif</Text>
              <Text style={[styles.code, { color: theme.primary }]}>{overview?.current_active_code ?? 'Belum ada kode'}</Text>
              <Text style={{ color: theme.textSecondary }}>Status: {overview?.code_status ? 'Aktif' : 'Nonaktif'}</Text>
              <Text style={{ color: theme.textSecondary }}>Reward: 7-day free trial</Text>
              <View style={styles.rowWrap}>
                <Text style={{ color: theme.text }}>Signup: {overview?.total_signups ?? 0}</Text>
                <Text style={{ color: theme.text }}>Subscription: {overview?.total_subscriptions ?? 0}</Text>
                <Text style={{ color: theme.text }}>Konversi: {conversionLabel}</Text>
              </View>
            </View>

            <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Stats</Text>
              <Text style={{ color: theme.textSecondary }}>People entered code: {stats?.total_code_entries ?? 0}</Text>
              <Text style={{ color: theme.textSecondary }}>Successful validations: {stats?.total_successful_validations ?? 0}</Text>
              <Text style={{ color: theme.textSecondary }}>Completed signups: {stats?.total_completed_signups ?? 0}</Text>
              <Text style={{ color: theme.textSecondary }}>Completed subscriptions: {stats?.total_completed_subscriptions ?? 0}</Text>
              <Text style={{ color: theme.textSecondary }}>Pending claims: {stats?.total_pending_claims ?? 0}</Text>
              <Text style={{ color: theme.textSecondary }}>Failed claims: {stats?.total_failed_claims ?? 0}</Text>
              <Text style={{ color: theme.textSecondary }}>
                Last redemption/use:{' '}
                {stats?.last_used_at ? new Date(stats.last_used_at).toLocaleString('id-ID') : '-'}
              </Text>
            </View>

            <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Code Management</Text>
              <View style={styles.rowWrap}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary }]} onPress={ensureCode}>
                  <Text style={styles.actionBtnLabel}>Create/Load Code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary }]} onPress={copyCode}>
                  <Text style={styles.actionBtnLabel}>Copy Code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.primary }]} onPress={toggleCode}>
                  <Text style={styles.actionBtnLabel}>{overview?.code_status ? 'Disable' : 'Enable'} Code</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: theme.textTertiary, marginTop: 8, fontSize: 12 }}>
                Regenerate code saat ini tidak diizinkan untuk creator. History tetap tersimpan karena berbasis code_id.
              </Text>
            </View>

            <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 4 }]}>Referral History</Text>
            <Text style={{ color: theme.textSecondary, marginBottom: 4 }}>
              Menampilkan data agregat/masked identifier demi privasi.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
            <Text style={{ color: theme.textSecondary }}>
              Belum ada redemption. Minta user memakai kode Anda dulu.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.rowItem, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={{ color: theme.text, fontWeight: '700' }}>{new Date(item.redemption_date).toLocaleString('id-ID')}</Text>
            <Text style={{ color: theme.textSecondary }}>Status: {item.status}</Text>
            <Text style={{ color: theme.textSecondary }}>Trial unlocked: {item.trial_unlocked ? 'Ya' : 'Tidak'}</Text>
            <Text style={{ color: theme.textSecondary }}>
              Subscription: {item.subscription_completed ? 'Selesai' : 'Belum'}
            </Text>
            <Text style={{ color: theme.textTertiary }}>User: {item.user_masked}</Text>
          </View>
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 14, padding: 12 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  code: { fontSize: 26, fontWeight: '900', letterSpacing: 2, marginVertical: 4 },
  filterChip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 6 },
  actionBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  actionBtnLabel: { color: '#FFFFFF', fontWeight: '700' },
  rowItem: { marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
});
