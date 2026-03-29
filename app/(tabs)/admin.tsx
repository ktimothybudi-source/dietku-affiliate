import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useNutrition } from '@/contexts/NutritionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase';
import {
  ADMIN_REFERRAL_PAGE_SIZE,
  adminCreateReferralCode,
  adminPatchReferralCode,
  fetchAdminReferralCodesPage,
  fetchRecentAttemptsForCode,
  fetchRedemptionsForCode,
  fetchReferralAudit,
  type ReferralCodeWithStats,
  type ReferralRedemptionRow,
  type ReferralAttemptRow,
  type ReferralAuditRow,
  type AdminCodesSort,
  type AdminCodesFilterActive,
  type AdminCodesFilterExpired,
  type AdminCodesFilterTrial,
} from '@/lib/referralAdmin';

export default function AdminReferralsScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { isAppAdmin } = useNutrition();
  const [rows, setRows] = useState<ReferralCodeWithStats[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [fActive, setFActive] = useState<AdminCodesFilterActive>('all');
  const [fExpired, setFExpired] = useState<AdminCodesFilterExpired>('all');
  const [fTrial, setFTrial] = useState<AdminCodesFilterTrial>('all');
  const [sortKey, setSortKey] = useState<AdminCodesSort>('newest');
  const [failCount, setFailCount] = useState<number | null>(null);
  const [selected, setSelected] = useState<ReferralCodeWithStats | null>(null);
  const [redemptions, setRedemptions] = useState<ReferralRedemptionRow[]>([]);
  const [attempts, setAttempts] = useState<ReferralAttemptRow[]>([]);
  const [audit, setAudit] = useState<ReferralAuditRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editTrial, setEditTrial] = useState('7');
  const [editLimit, setEditLimit] = useState('');
  const [editExpires, setEditExpires] = useState('');
  const [editOwner, setEditOwner] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [cCode, setCCode] = useState('');
  const [cOwner, setCOwner] = useState('');
  const [cTrial, setCTrial] = useState('30');
  const [cLimit, setCLimit] = useState('');
  const [cExpires, setCExpires] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const reload = useCallback(async () => {
    if (!isAppAdmin) return;
    setLoading(true);
    setRows([]);
    try {
      const { rows: first, total } = await fetchAdminReferralCodesPage({
        offset: 0,
        limit: ADMIN_REFERRAL_PAGE_SIZE,
        sortKey,
        search: debouncedSearch,
        fActive,
        fExpired,
        fTrial,
      });
      setRows(first);
      setTotalCount(total);
      const { count, error } = await supabase
        .from('referral_attempt_logs')
        .select('*', { count: 'exact', head: true })
        .eq('outcome', 'failure');
      if (!error) setFailCount(count ?? 0);
      const a = await fetchReferralAudit(40);
      setAudit(a);
    } catch (e) {
      console.warn(e);
      Alert.alert('Gagal memuat', e instanceof Error ? e.message : 'Coba lagi.');
    } finally {
      setLoading(false);
    }
  }, [isAppAdmin, sortKey, debouncedSearch, fActive, fExpired, fTrial]);

  const loadMore = useCallback(async () => {
    if (!isAppAdmin || loading || loadingMore) return;
    if (rows.length >= totalCount) return;
    setLoadingMore(true);
    try {
      const { rows: next, total } = await fetchAdminReferralCodesPage({
        offset: rows.length,
        limit: ADMIN_REFERRAL_PAGE_SIZE,
        sortKey,
        search: debouncedSearch,
        fActive,
        fExpired,
        fTrial,
      });
      setTotalCount(total);
      setRows((prev) => [...prev, ...next]);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoadingMore(false);
    }
  }, [
    isAppAdmin,
    loading,
    loadingMore,
    rows.length,
    totalCount,
    sortKey,
    debouncedSearch,
    fActive,
    fExpired,
    fTrial,
  ]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const now = Date.now();

  const pageRedemptions = useMemo(
    () => rows.reduce((s, x) => s + x.redemption_count, 0),
    [rows],
  );

  const openDetail = async (row: ReferralCodeWithStats) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected(row);
    setEditTrial(String(row.trial_days));
    setEditLimit(row.usage_limit != null ? String(row.usage_limit) : '');
    setEditExpires(row.expires_at ? row.expires_at.slice(0, 10) : '');
    setEditOwner(row.owner_user_id);
    setEditActive(row.is_active);
    setDetailLoading(true);
    try {
      const [red, att] = await Promise.all([
        fetchRedemptionsForCode(row.id),
        fetchRecentAttemptsForCode(row.code_normalized),
      ]);
      setRedemptions(red);
      setAttempts(att);
    } catch (e) {
      Alert.alert('Detail', e instanceof Error ? e.message : 'Gagal');
    } finally {
      setDetailLoading(false);
    }
  };

  const saveDetail = async () => {
    if (!selected) return;
    const td = parseInt(editTrial, 10);
    if (Number.isNaN(td) || td < 1) {
      Alert.alert('Validasi', 'Trial days tidak valid.');
      return;
    }
    const lim = editLimit.trim() === '' ? null : parseInt(editLimit, 10);
    if (lim != null && (Number.isNaN(lim) || lim <= 0)) {
      Alert.alert('Validasi', 'Usage limit tidak valid (kosongkan untuk tak terbatas).');
      return;
    }
    let expIso: string | null = null;
    if (editExpires.trim()) {
      const d = new Date(`${editExpires.trim()}T23:59:59.999Z`);
      if (Number.isNaN(d.getTime())) {
        Alert.alert('Validasi', 'Tanggal kedaluwarsa tidak valid (YYYY-MM-DD).');
        return;
      }
      expIso = d.toISOString();
    }
    if (!editOwner.trim()) {
      Alert.alert('Validasi', 'Owner user id wajib.');
      return;
    }
    setSaving(true);
    try {
      const res = await adminPatchReferralCode({
        id: selected.id,
        trialDays: td,
        usageLimit: lim,
        expiresAt: expIso,
        isActive: editActive,
        ownerUserId: editOwner.trim(),
      });
      if (!res.ok) {
        Alert.alert('Gagal', res.error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelected(null);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const quickToggle = async (row: ReferralCodeWithStats) => {
    setSaving(true);
    try {
      const res = await adminPatchReferralCode({
        id: row.id,
        trialDays: row.trial_days,
        usageLimit: row.usage_limit,
        expiresAt: row.expires_at,
        isActive: !row.is_active,
        ownerUserId: row.owner_user_id,
      });
      if (!res.ok) Alert.alert('Gagal', res.error);
      else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await reload();
        if (selected?.id === row.id) setSelected({ ...row, is_active: !row.is_active });
      }
    } finally {
      setSaving(false);
    }
  };

  const submitCreate = async () => {
    const td = parseInt(cTrial, 10);
    if (!cCode.trim() || !cOwner.trim() || Number.isNaN(td)) {
      Alert.alert('Validasi', 'Kode, owner UUID, dan trial days wajib.');
      return;
    }
    let lim: number | null | undefined;
    if (cLimit.trim()) {
      lim = parseInt(cLimit, 10);
      if (Number.isNaN(lim) || lim <= 0) {
        Alert.alert('Validasi', 'Usage limit tidak valid.');
        return;
      }
    }
    let exp: string | null | undefined;
    if (cExpires.trim()) {
      const d = new Date(`${cExpires.trim()}T23:59:59.999Z`);
      if (Number.isNaN(d.getTime())) {
        Alert.alert('Validasi', 'Tanggal tidak valid.');
        return;
      }
      exp = d.toISOString();
    }
    setSaving(true);
    try {
      const res = await adminCreateReferralCode({
        code: cCode.trim(),
        ownerUserId: cOwner.trim(),
        trialDays: td,
        usageLimit: lim ?? null,
        expiresAt: exp ?? null,
        codeKind: 'promo',
        isActive: true,
      });
      if (!res.ok) {
        Alert.alert('Gagal', res.error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateOpen(false);
      setCCode('');
      setCOwner('');
      await reload();
    } finally {
      setSaving(false);
    }
  };

  if (!isAppAdmin) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Akses ditolak</Text>
        <Text style={{ color: theme.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 24 }}>
          Hanya admin yang dapat membuka panel ini. Set app_role = admin pada profil Anda di Supabase.
        </Text>
      </View>
    );
  }

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <TouchableOpacity
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[
        styles.chip,
        { borderColor: theme.border, backgroundColor: on ? `${theme.primary}22` : theme.card },
      ]}
    >
      <Text style={{ color: on ? theme.primary : theme.textSecondary, fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <Text style={[styles.title, { color: theme.text }]}>Referral admin</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {chip('Semua aktif', fActive === 'all', () => setFActive('all'))}
        {chip('Aktif', fActive === 'active', () => setFActive('active'))}
        {chip('Nonaktif', fActive === 'inactive', () => setFActive('inactive'))}
        {chip('Belum expired', fExpired === 'valid', () => setFExpired(fExpired === 'valid' ? 'all' : 'valid'))}
        {chip('Expired', fExpired === 'expired', () => setFExpired(fExpired === 'expired' ? 'all' : 'expired'))}
        {chip('Trial 7h', fTrial === '7', () => setFTrial(fTrial === '7' ? 'all' : '7'))}
        {chip('Trial 30h', fTrial === '30', () => setFTrial(fTrial === '30' ? 'all' : '30'))}
        {chip('Custom trial', fTrial === 'custom', () => setFTrial(fTrial === 'custom' ? 'all' : 'custom'))}
      </ScrollView>
      <View style={styles.chipRowWrap}>
        <Text style={{ color: theme.textSecondary, fontSize: 12, marginRight: 8 }}>Urut:</Text>
        {chip('Terbaru', sortKey === 'newest', () => setSortKey('newest'))}
        {chip('Terbanyak pakai', sortKey === 'most_used', () => setSortKey('most_used'))}
        {chip('Segera habis', sortKey === 'expiring', () => setSortKey('expiring'))}
      </View>

      <View style={[styles.metrics, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 6 }}>Ringkasan (filter aktif)</Text>
        <Text style={{ color: theme.text, fontSize: 13 }}>
          Total cocok filter: {totalCount} · Terunduh: {rows.length}
        </Text>
        <Text style={{ color: theme.text, fontSize: 13, marginTop: 4 }}>
          Σ redeem (baris terunduh): {pageRedemptions}
          {failCount != null ? ` · Log gagal (global): ${failCount}` : ''}
        </Text>
        <Text style={{ color: theme.textTertiary, fontSize: 11, marginTop: 6 }}>
          Gulir ke bawah untuk memuat lebih banyak (±{ADMIN_REFERRAL_PAGE_SIZE} per halaman).
        </Text>
      </View>

      <View style={styles.toolbar}>
        <TextInput
          style={[
            styles.search,
            { color: theme.text, borderColor: theme.border, backgroundColor: theme.card },
          ]}
          placeholder="Cari kode…"
          placeholderTextColor={theme.textTertiary}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="characters"
        />
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setCreateOpen(true);
          }}
        >
          <Text style={styles.addBtnText}>+ Kode</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={theme.primary} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={rows}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
          onEndReached={() => {
            void loadMore();
          }}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            <View style={{ marginTop: 12 }}>
              {loadingMore ? (
                <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
              ) : null}
              <View style={[styles.auditBox, { borderColor: theme.border }]}>
                <Text style={{ color: theme.text, fontWeight: '700', marginBottom: 6 }}>Audit (terbaru)</Text>
                {audit.slice(0, 8).map((l) => (
                  <Text key={l.id} style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 4 }}>
                    {l.action} · {new Date(l.created_at).toLocaleString('id-ID')}
                  </Text>
                ))}
                {audit.length === 0 ? (
                  <Text style={{ color: theme.textTertiary, fontSize: 12 }}>Kosong</Text>
                ) : null}
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const expired = item.expires_at && new Date(item.expires_at).getTime() < now;
            return (
              <TouchableOpacity
                style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={() => openDetail(item)}
                activeOpacity={0.85}
              >
                <View style={styles.cardTop}>
                  <Text style={[styles.code, { color: theme.text }]}>{item.code_normalized}</Text>
                  <Switch
                    value={item.is_active}
                    onValueChange={() => quickToggle(item)}
                    disabled={saving}
                  />
                </View>
                <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>
                  Trial {item.trial_days}h · Pakai {item.redemption_count}
                  {item.usage_limit != null ? ` / ${item.usage_limit}` : ' / ∞'}
                  {item.remaining_uses != null ? ` · Sisa ${item.remaining_uses}` : ''}
                </Text>
                <Text style={{ color: theme.textTertiary, fontSize: 11, marginTop: 4 }}>
                  {expired ? 'EXPIRED · ' : ''}
                  {item.last_redeemed_at
                    ? `Terakhir redeem: ${new Date(item.last_redeemed_at).toLocaleString('id-ID')}`
                    : 'Belum pernah redeem'}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            loading ? null : (
              <Text style={{ color: theme.textSecondary, textAlign: 'center', marginTop: 24 }}>Tidak ada data.</Text>
            )
          }
        />
      )}

      <Modal visible={!!selected} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Detail kode</Text>
            {detailLoading ? (
              <ActivityIndicator color={theme.primary} style={{ marginVertical: 16 }} />
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 480 }}>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Kode</Text>
                <Text style={{ color: theme.text, fontWeight: '800', fontSize: 18 }}>{selected?.code_normalized}</Text>

                <Text style={styles.fieldLabel}>Trial (hari)</Text>
                <TextInput
                  style={[styles.field, { color: theme.text, borderColor: theme.border }]}
                  value={editTrial}
                  onChangeText={setEditTrial}
                  keyboardType="number-pad"
                />
                <Text style={styles.fieldLabel}>Usage limit (kosong = tak terbatas)</Text>
                <TextInput
                  style={[styles.field, { color: theme.text, borderColor: theme.border }]}
                  value={editLimit}
                  onChangeText={setEditLimit}
                  keyboardType="number-pad"
                />
                <Text style={styles.fieldLabel}>Expires (YYYY-MM-DD, kosong = tidak ada)</Text>
                <TextInput
                  style={[styles.field, { color: theme.text, borderColor: theme.border }]}
                  value={editExpires}
                  onChangeText={setEditExpires}
                  placeholder="2026-12-31"
                  placeholderTextColor={theme.textTertiary}
                />
                <Text style={styles.fieldLabel}>Owner user UUID</Text>
                <TextInput
                  style={[styles.field, { color: theme.text, borderColor: theme.border }]}
                  value={editOwner}
                  onChangeText={setEditOwner}
                  autoCapitalize="none"
                />
                <View style={styles.rowBetween}>
                  <Text style={{ color: theme.text }}>Aktif</Text>
                  <Switch value={editActive} onValueChange={setEditActive} />
                </View>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>Redemptions</Text>
                {redemptions.map((r) => (
                  <Text key={r.id} style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 4 }}>
                    {r.redeemer_user_id.slice(0, 8)}… · {new Date(r.redeemed_at).toLocaleString('id-ID')}
                  </Text>
                ))}
                {redemptions.length === 0 ? (
                  <Text style={{ color: theme.textTertiary, fontSize: 12 }}>Belum ada.</Text>
                ) : null}

                <Text style={[styles.sectionTitle, { color: theme.text }]}>Percobaan gagal (log)</Text>
                {attempts.slice(0, 15).map((a) => (
                  <Text key={a.id} style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 2 }}>
                    {a.error_code ?? a.outcome} · {new Date(a.created_at).toLocaleString('id-ID')}
                  </Text>
                ))}
              </ScrollView>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setSelected(null)}>
                <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Tutup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }]}
                onPress={saveDetail}
                disabled={saving}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={createOpen} animationType="fade" transparent onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: theme.card }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Kode promo baru</Text>
            <Text style={styles.fieldLabel}>Kode</Text>
            <TextInput
              style={[styles.field, { color: theme.text, borderColor: theme.border }]}
              value={cCode}
              onChangeText={(t) => setCCode(t.toUpperCase())}
              autoCapitalize="characters"
            />
            <Text style={styles.fieldLabel}>Owner UUID</Text>
            <TextInput
              style={[styles.field, { color: theme.text, borderColor: theme.border }]}
              value={cOwner}
              onChangeText={setCOwner}
              autoCapitalize="none"
            />
            <Text style={styles.fieldLabel}>Trial hari</Text>
            <TextInput
              style={[styles.field, { color: theme.text, borderColor: theme.border }]}
              value={cTrial}
              onChangeText={setCTrial}
              keyboardType="number-pad"
            />
            <Text style={styles.fieldLabel}>Limit (opsional)</Text>
            <TextInput
              style={[styles.field, { color: theme.text, borderColor: theme.border }]}
              value={cLimit}
              onChangeText={setCLimit}
              keyboardType="number-pad"
            />
            <Text style={styles.fieldLabel}>Expires YYYY-MM-DD (opsional)</Text>
            <TextInput
              style={[styles.field, { color: theme.text, borderColor: theme.border }]}
              value={cExpires}
              onChangeText={setCExpires}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.btnGhost} onPress={() => setCreateOpen(false)}>
                <Text style={{ color: theme.textSecondary, fontWeight: '700' }}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: theme.primary }]}
                onPress={submitCreate}
                disabled={saving}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>Buat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', paddingHorizontal: 16, marginBottom: 12 },
  chipRow: { gap: 8, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center' },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, marginRight: 6, marginBottom: 6 },
  metrics: { marginHorizontal: 16, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  toolbar: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 10, alignItems: 'center' },
  search: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  addBtn: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12 },
  addBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontSize: 17, fontWeight: '800', letterSpacing: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '92%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  fieldLabel: { color: '#888', fontSize: 12, marginTop: 10, marginBottom: 4 },
  field: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 16 },
  btnGhost: { paddingVertical: 12, paddingHorizontal: 8 },
  btnPrimary: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  auditBox: { borderWidth: 1, borderRadius: 12, padding: 12 },
});
