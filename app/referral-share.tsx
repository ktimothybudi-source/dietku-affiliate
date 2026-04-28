import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  TextInput,
} from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useNutrition } from '@/contexts/NutritionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/lib/supabase';
import {
  createMyAffiliateCode,
  invalidateReferralProfile,
  redeemReferralCode,
  redeemErrorMessageForUi,
} from '@/lib/referral';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { Users, Gift } from 'lucide-react-native';

export default function ReferralShareScreen() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { l } = useLanguage();
  const { authState, referralTrialEndsAt } = useNutrition();
  const queryClient = useQueryClient();
  const { refreshSubscription } = useSubscription();
  const uid = authState.userId;

  const [creating, setCreating] = useState(false);
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const [friendCode, setFriendCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  const myCodeQuery = useQuery({
    queryKey: ['my_referral_code', uid],
    queryFn: async () => {
      if (!uid) return null;
      const { data, error } = await supabase
        .from('referral_codes')
        .select('id, code_normalized, trial_days, is_active')
        .eq('owner_user_id', uid)
        .eq('code_kind', 'affiliate')
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; code_normalized: string; trial_days: number; is_active: boolean } | null;
    },
    enabled: !!uid,
  });

  const redemptionCountQuery = useQuery({
    queryKey: ['referral_redemption_count', myCodeQuery.data?.id],
    queryFn: async () => {
      if (!myCodeQuery.data?.id) return 0;
      const { count, error } = await supabase
        .from('referral_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('referral_code_id', myCodeQuery.data.id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!myCodeQuery.data?.id,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!uid || !myCodeQuery.isSuccess || bootstrapDone) return;
      if (myCodeQuery.data !== null) {
        setBootstrapDone(true);
        return;
      }
      setCreating(true);
      const res = await createMyAffiliateCode();
      if (!cancelled) {
        setBootstrapDone(true);
        setCreating(false);
        if (res.ok) {
          await queryClient.invalidateQueries({ queryKey: ['my_referral_code', uid] });
        } else {
          Alert.alert(l('Kode undangan', 'Invite code'), l('Tidak dapat membuat kode otomatis. Coba lagi nanti.', 'Could not create code automatically. Please try again later.'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, myCodeQuery.isSuccess, myCodeQuery.data, bootstrapDone, queryClient]);

  const code = myCodeQuery.data?.code_normalized;

  const onShare = useCallback(async () => {
    if (!code) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({
        message: l(`Gabung DietKu pakai kode undanganku: ${code}`, `Join DietKu using my invite code: ${code}`),
      });
    } catch {
      // no-op
    }
  }, [code]);

  if (!authState.isSignedIn) {
    return (
      <>
        <Stack.Screen options={{ title: l('Undangan', 'Invites'), headerShown: true }} />
        <View style={[styles.center, { paddingTop: insets.top }]}>
          <Text style={{ color: theme.textSecondary }}>{l('Masuk untuk melihat kode undangan.', 'Sign in to view your invite code.')}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: l('Undangan', 'Invites'), headerShown: true }} />
      <View style={[styles.container, { paddingTop: insets.top + 16, backgroundColor: theme.background }]}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.rowTitle}>
            <Gift size={22} color={theme.primary} />
            <Text style={[styles.title, { color: theme.text }]}>{l('Kode undangan Anda', 'Your invite code')}</Text>
          </View>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            {l('Bagikan kode undangan Anda. Pengguna yang memakai kode ini masuk ke flow trial 7 hari.', 'Share your invite code. Users who use this code enter a 7-day trial flow.')}
          </Text>
          {creating || myCodeQuery.isLoading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={theme.primary} />
          ) : (
            <>
              <Text style={[styles.code, { color: theme.primary }]} selectable>
                {code ?? '—'}
              </Text>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.primary }]}
                onPress={onShare}
                disabled={!code}
                activeOpacity={0.85}
              >
                <Users size={18} color="#FFFFFF" />
                <Text style={styles.btnLabel}>{l('Bagikan', 'Share')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{l('Orang yang menggunakan kode Anda', 'People who used your code')}</Text>
          <Text style={[styles.statVal, { color: theme.text }]}>
            {redemptionCountQuery.isLoading ? '…' : redemptionCountQuery.data ?? 0}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text, marginBottom: 8 }]}>{l('Pakai kode teman', "Use a friend's code")}</Text>
          <Text style={[styles.sub, { color: theme.textSecondary, marginBottom: 12 }]}>
            {l('Hanya berlaku sekali per akun. Tidak bisa digabung dengan langganan aktif.', 'Can only be used once per account. Cannot be combined with an active subscription.')}
          </Text>
          <TextInput
            style={[
              styles.input,
              { color: theme.text, borderColor: theme.border, backgroundColor: theme.background },
            ]}
            value={friendCode}
            onChangeText={(t) => setFriendCode(t.toUpperCase())}
            placeholder={l('Kode', 'Code')}
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="characters"
            editable={!redeeming}
          />
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: theme.primary, marginTop: 12 }]}
            disabled={redeeming}
            onPress={async () => {
              const raw = friendCode.trim();
              if (!raw) {
                Alert.alert(l('Kode kosong', 'Code is empty'), l('Masukkan kode undangan.', 'Enter an invite code.'));
                return;
              }
              setRedeeming(true);
              try {
                const res = await redeemReferralCode(raw, { screen: 'referral-share' });
                if (res.ok) {
                  invalidateReferralProfile(queryClient);
                  await refreshSubscription();
                  Alert.alert(l('Berhasil', 'Success'), l(`Anda mendapat ${res.trial_days} hari percobaan gratis.`, `You got ${res.trial_days} days of free trial.`));
                  setFriendCode('');
                } else {
                  Alert.alert(l('Gagal', 'Failed'), redeemErrorMessageForUi(res.error, res.message));
                }
              } finally {
                setRedeeming(false);
              }
            }}
            activeOpacity={0.85}
          >
            {redeeming ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.btnLabel}>{l('Terapkan kode', 'Apply code')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {referralTrialEndsAt && new Date(referralTrialEndsAt) > new Date() ? (
          <Text style={[styles.foot, { color: theme.textTertiary }]}>
            Masa percobaan Anda dari undangan aktif hingga {new Date(referralTrialEndsAt).toLocaleDateString('id-ID')}.
          </Text>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 16, borderWidth:1, padding: 18 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  title: { fontSize: 18, fontWeight: '700' },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  code: { fontSize: 28, fontWeight: '800', letterSpacing: 2, textAlign: 'center', marginBottom: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  btnLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  statLabel: { fontSize: 14, marginBottom: 4 },
  statVal: { fontSize: 28, fontWeight: '800' },
  foot: { fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
