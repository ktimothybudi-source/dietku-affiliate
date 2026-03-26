import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { useNutrition } from '@/contexts/NutritionContext';
import { supabase } from '@/lib/supabase';
import { Ticket, ArrowRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export default function BrowseGroupsScreen() {
  const { theme } = useTheme();
  const { joinGroupAsync, hasProfile } = useCommunity();
  const { authState } = useNutrition();
  const [inviteCode, setInviteCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const handleJoinByCode = useCallback(async () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      Alert.alert('Kode Kosong', 'Masukkan kode undangan grup.');
      return;
    }
    if (!authState.isSignedIn) {
      Alert.alert('Masuk Diperlukan', 'Silakan masuk terlebih dahulu.');
      return;
    }
    if (!hasProfile) {
      Alert.alert('Profil Komunitas', 'Silakan lengkapi profil komunitas terlebih dahulu.');
      router.push('/setup-community-profile');
      return;
    }

    setIsJoining(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { data, error } = await supabase
        .from('community_groups')
        .select('id')
        .eq('invite_code', code)
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) {
        Alert.alert('Kode Tidak Ditemukan', 'Kode grup tidak valid. Coba cek lagi.');
        return;
      }

      await joinGroupAsync(data.id);
      Alert.alert('Berhasil', 'Kamu berhasil bergabung ke grup.');
      router.back();
    } catch (error) {
      console.error('Join group by code error:', error);
      if (error instanceof Error) {
        Alert.alert('Gagal Gabung Grup', error.message || 'Terjadi kesalahan saat memproses kode.');
      } else {
        Alert.alert('Gagal Gabung Grup', 'Terjadi kesalahan saat memproses kode.');
      }
    } finally {
      setIsJoining(false);
    }
  }, [inviteCode, authState.isSignedIn, hasProfile, joinGroupAsync]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Cari Grup',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
        }}
      />

      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.codeSection}>
          <View style={[styles.codeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.codeIconWrap, { backgroundColor: theme.primary + '12' }]}>
              <Ticket size={34} color={theme.primary} />
            </View>
            <Text style={[styles.codeTitle, { color: theme.text }]}>Gabung Dengan Kode</Text>
            <Text style={[styles.codeDesc, { color: theme.textSecondary }]}>
              Masukkan kode undangan dari admin grup untuk langsung bergabung ke grup privat.
            </Text>
            <View style={[styles.codeInputWrap, { borderColor: theme.border }]}>
              <TextInput
                style={[styles.codeInput, { color: theme.text }]}
                value={inviteCode}
                onChangeText={(text) => setInviteCode(text.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
                placeholder="ABC123"
                placeholderTextColor={theme.textTertiary}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                returnKeyType="done"
              />
            </View>
            <TouchableOpacity
              style={[styles.joinCodeBtn, { backgroundColor: theme.primary }]}
              onPress={handleJoinByCode}
              activeOpacity={0.8}
              disabled={isJoining}
            >
              <Text style={[styles.joinCodeBtnText, { color: '#FFFFFF' }]}>
                {isJoining ? 'Menggabungkan...' : 'Gabung Grup'}
              </Text>
              {!isJoining ? <ArrowRight size={18} color="#FFFFFF" /> : null}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  searchWrap: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  groupCover: {
    width: 56,
    height: 56,
    borderRadius: 12,
  },
  groupInfo: {
    flex: 1,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupName: {
    fontSize: 15,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
    flex: 1,
  },
  groupDesc: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  groupMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  groupMembers: {
    fontSize: 12,
  },
  joinBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  joinBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700' as const,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    marginTop: 8,
  },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  codeSection: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  codeCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  codeIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  codeTitle: {
    fontSize: 19,
    fontWeight: '800' as const,
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  codeDesc: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 24,
  },
  codeInputWrap: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  codeInput: {
    fontSize: 24,
    fontWeight: '800' as const,
    textAlign: 'center',
    paddingVertical: 16,
    letterSpacing: 8,
  },
  joinCodeBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 12,
  },
  joinCodeBtnText: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
});
