import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Platform,
  Share,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { GroupMember } from '@/types/community';
import {
  Copy,
  Share2,
  LogOut,
  Users,
  Shield,
  Crown,
  Lock,
  Globe,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    const navigatorAny = (globalThis as { navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } } }).navigator;
    if (navigatorAny?.clipboard?.writeText) {
      await navigatorAny.clipboard.writeText(text);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Clipboard error:', error);
    return false;
  }
};

export default function GroupSettingsScreen() {
  const { theme } = useTheme();
  const { l } = useLanguage();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { allGroups, leaveGroup, communityProfile } = useCommunity();
  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/community');
  }, []);

  const group = useMemo(() => {
    return allGroups.find(g => g.id === groupId) || null;
  }, [allGroups, groupId]);

  const isAdmin = useMemo(() => {
    if (!group || !communityProfile) return false;
    return group.members.some(m => m.userId === communityProfile.userId && m.role === 'admin');
  }, [group, communityProfile]);

  const handleCopyCode = useCallback(async () => {
    if (!group) return;
    console.log('group-settings:copy-code', group.inviteCode);
    const copied = await copyToClipboard(group.inviteCode);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (copied) {
      Alert.alert(l('Kode Disalin!', 'Code Copied!'), l(`Kode undangan "${group.inviteCode}" sudah disalin. Bagikan ke teman untuk mengundang mereka.`, `Invite code "${group.inviteCode}" copied. Share it with your friends.`));
    } else {
      Alert.alert(l('Kode Undangan', 'Invite Code'), l(`Kode: ${group.inviteCode}\n\nBagikan kode ini ke teman untuk mengundang mereka ke grup.`, `Code: ${group.inviteCode}\n\nShare this code with your friends to invite them.`));
    }
  }, [group]);

  const handleShareInvite = useCallback(async () => {
    if (!group) return;
    console.log('group-settings:share-invite', group.inviteCode);
    const message = `Gabung ke grup "${group.name}" di DietKu!\n\nKode undangan: ${group.inviteCode}\n\nBuka aplikasi DietKu → Komunitas → Cari Grup → Kode Undangan → Masukkan kode di atas.`;

    if (Platform.OS !== 'web') {
      try {
        await Share.share({ message });
      } catch (e) {
        console.log('Share cancelled or failed:', e);
      }
    } else {
      const copied = await copyToClipboard(message);
      if (copied) {
        Alert.alert(l('Link Disalin!', 'Invite Copied!'), l('Pesan undangan sudah disalin ke clipboard.', 'Invite message copied to clipboard.'));
      } else {
        Alert.alert(l('Undangan', 'Invite'), message);
      }
    }
  }, [group]);

  const handleLeaveGroup = useCallback(() => {
    if (!group) return;
    console.log('group-settings:leave', group.id);
    Alert.alert(
      l('Keluar dari Grup?', 'Leave Group?'),
      l(`Kamu yakin ingin keluar dari "${group.name}"? Kamu bisa bergabung kembali nanti.`, `Are you sure you want to leave "${group.name}"? You can rejoin later.`),
      [
        { text: l('Batal', 'Cancel'), style: 'cancel' },
        {
          text: l('Keluar', 'Leave'),
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            leaveGroup(group.id);
            handleBack();
          },
        },
      ]
    );
  }, [group, leaveGroup, handleBack, l]);

  if (!group) {
    return (
      <>
        <Stack.Screen
          options={{
            title: l('Pengaturan Grup', 'Group Settings'),
            headerStyle: { backgroundColor: theme.background },
            headerTintColor: theme.text,
            headerShadowVisible: false,
            headerLeft: () => (
              <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={styles.headerBackBtn}>
                <Text style={[styles.headerBackText, { color: theme.primary }]}>Back</Text>
              </TouchableOpacity>
            ),
          }}
        />
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <View style={styles.errorState}>
            <Text style={[styles.errorText, { color: theme.textSecondary }]}>{l('Grup tidak ditemukan', 'Group not found')}</Text>
          </View>
        </View>
      </>
    );
  }

  const renderMember = (member: GroupMember, index: number) => {
    const initials = member.displayName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return (
      <View key={member.userId + index} style={[styles.memberRow, { borderColor: theme.border }]}>
        <View style={[styles.memberAvatar, { backgroundColor: member.avatarColor }]}>
          <Text style={styles.memberAvatarText}>{initials}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={[styles.memberName, { color: theme.text }]}>{member.displayName}</Text>
          <Text style={[styles.memberUsername, { color: theme.textTertiary }]}>@{member.username}</Text>
        </View>
        {member.role === 'admin' && (
          <View style={[styles.roleBadge, { backgroundColor: theme.warning + '18' }]}>
            <Crown size={12} color={theme.warning} />
            <Text style={[styles.roleBadgeText, { color: theme.warning }]}>Admin</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: l('Pengaturan Grup', 'Group Settings'),
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={handleBack} activeOpacity={0.7} style={styles.headerBackBtn}>
              <Text style={[styles.headerBackText, { color: theme.primary }]}>Back</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Image source={{ uri: group.coverImage }} style={styles.coverImage} />

        <View style={styles.groupHeader}>
          <View style={styles.groupTitleRow}>
            <Text style={[styles.groupName, { color: theme.text }]}>{group.name}</Text>
            {group.privacy === 'private' ? (
              <Lock size={16} color={theme.warning} />
            ) : (
              <Globe size={16} color={theme.success} />
            )}
          </View>
          <Text style={[styles.groupDesc, { color: theme.textSecondary }]}>{group.description}</Text>
          <View style={styles.groupStats}>
            <View style={styles.statItem}>
              <Users size={14} color={theme.textTertiary} />
              <Text style={[styles.statText, { color: theme.textTertiary }]}>{group.members.length} {l('anggota', 'members')}</Text>
            </View>
            <View style={styles.statItem}>
              <Shield size={14} color={theme.textTertiary} />
              <Text style={[styles.statText, { color: theme.textTertiary }]}>
                {group.privacy === 'public' ? l('Publik', 'Public') : l('Privat', 'Private')}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.inviteCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{l('Kode Undangan', 'Invite Code')}</Text>
          <Text style={[styles.inviteHint, { color: theme.textSecondary }]}>
            {l('Bagikan kode ini untuk mengundang teman ke grup', 'Share this code to invite friends to the group')}
          </Text>

          <View style={[styles.codeDisplay, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <Text style={[styles.codeText, { color: theme.primary }]}>{group.inviteCode}</Text>
          </View>

          <View style={styles.inviteActions}>
            <TouchableOpacity
              style={[styles.inviteBtn, { backgroundColor: theme.primary }]}
              onPress={handleCopyCode}
              activeOpacity={0.8}
              testID="group-copy-code"
            >
              <Copy size={16} color="#FFFFFF" />
              <Text style={styles.inviteBtnText}>{l('Salin Kode', 'Copy Code')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.inviteBtn, { backgroundColor: theme.success }]}
              onPress={handleShareInvite}
              activeOpacity={0.8}
              testID="group-share-invite"
            >
              <Share2 size={16} color="#FFFFFF" />
              <Text style={styles.inviteBtnText}>{l('Bagikan', 'Share')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.membersCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {l('Anggota', 'Members')} ({group.members.length})
          </Text>
          {group.members.map(renderMember)}
        </View>

        <TouchableOpacity
          style={[styles.leaveBtn, { borderColor: theme.destructive }]}
          onPress={handleLeaveGroup}
          activeOpacity={0.8}
          testID="group-leave"
        >
          <LogOut size={18} color={theme.destructive} />
          <Text style={[styles.leaveBtnText, { color: theme.destructive }]}>{l('Keluar dari Grup', 'Leave Group')}</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 20,
  },
  coverImage: {
    width: '100%',
    height: 160,
  },
  groupHeader: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  groupName: {
    fontSize: 22,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
  },
  groupDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  groupStats: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statText: {
    fontSize: 13,
  },
  inviteCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  inviteHint: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  codeDisplay: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  codeText: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: 8,
  },
  inviteActions: {
    flexDirection: 'row',
    gap: 10,
  },
  inviteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  inviteBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  membersCard: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  memberUsername: {
    fontSize: 12,
    marginTop: 1,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
  leaveBtn: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  leaveBtnText: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 15,
  },
  headerBackBtn: {
    paddingVertical: 6,
    paddingRight: 8,
  },
  headerBackText: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
});
