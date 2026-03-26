import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { useNutrition } from '@/contexts/NutritionContext';
import { CommunityGroup } from '@/types/community';
import { Search, Users, Lock, Globe, Ticket, ArrowRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export default function BrowseGroupsScreen() {
  const { theme } = useTheme();
  const {} = useCommunity();
  const {} = useNutrition();

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

      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.emptyState}>
          <Users size={40} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Fitur Dinonaktifkan</Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
            Fitur grup publik dinonaktifkan sementara. Silakan kembali ke halaman Komunitas.
          </Text>
          <TouchableOpacity
            style={[styles.joinCodeBtn, { backgroundColor: theme.primary, marginTop: 12 }]}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.joinCodeBtnText}>Kembali</Text>
          </TouchableOpacity>
        </View>
      </View>
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
