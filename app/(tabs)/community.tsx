import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  Animated,
  RefreshControl,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import {
  Heart,
  MessageCircle,
  Plus,
  Utensils,
  Trash2,
  Clock,
  Send,
  Users,
  UserPlus,
  Search,
  Globe,
  Settings,
  ChevronDown,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { useNutrition } from '@/contexts/NutritionContext';
import { FoodPost, MEAL_TYPE_LABELS, CommunityGroup } from '@/types/community';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { communityStyles as styles } from '@/styles/communityStyles';
import { PremiumDisplayName } from '@/components/PremiumDisplayName';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

const PostCard = React.memo(({ post, onLike, onComment, onDelete, currentUserId, theme, l }: {
  post: FoodPost;
  onLike: (id: string) => void;
  onComment: (id: string) => void;
  onDelete: (id: string) => void;
  currentUserId: string | null;
  theme: ReturnType<typeof useTheme>['theme'];
  l: (idText: string, enText: string) => string;
}) => {
  const isLiked = currentUserId ? post.likes.includes(currentUserId) : false;
  const isOwn = currentUserId === post.userId;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const isAutoLog = (post as { isAutoLog?: boolean }).isAutoLog ?? !post.caption;
  const [imageFailed, setImageFailed] = useState(false);

  const handleLike = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    onLike(post.id);
  }, [post.id, onLike, scaleAnim]);

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(l('Hapus Post', 'Delete Post'), l('Yakin ingin menghapus post ini?', 'Are you sure you want to delete this post?'), [
      { text: l('Batal', 'Cancel'), style: 'cancel' },
      { text: l('Hapus', 'Delete'), style: 'destructive', onPress: () => onDelete(post.id) },
    ]);
  }, [post.id, onDelete, l]);

  return (
    <View style={[styles.postCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.postHeader}>
        <TouchableOpacity style={styles.postUserInfo} activeOpacity={0.7} testID={`post-user-${post.id}`}>
          <Avatar name={post.displayName} color={post.avatarColor} size={38} />
          <View style={styles.postUserText}>
            <PremiumDisplayName
              text={post.displayName}
              premium={false}
              color={theme.text}
              fontSize={15}
              fontWeight="700"
            />
            <View style={styles.postMeta}>
              <Text style={[styles.postUsername, { color: theme.textTertiary }]}>@{post.username}</Text>
              <Text style={[styles.postDot, { color: theme.textTertiary }]}>·</Text>
              <Clock size={11} color={theme.textTertiary} />
              <Text style={[styles.postTime, { color: theme.textTertiary }]}>{timeAgo(post.createdAt)}</Text>
            </View>
          </View>
        </TouchableOpacity>
        {isOwn && (
          <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn} activeOpacity={0.7} testID={`post-delete-${post.id}`}>
            <Trash2 size={16} color={theme.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {post.caption ? (
        <Text style={[styles.postCaption, { color: theme.text }]}>{post.caption}</Text>
      ) : null}

      <View style={[styles.foodCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
        <View style={styles.foodCardHeader}>
          <Utensils size={14} color={theme.primary} />
          <Text style={[styles.foodName, { color: theme.text }]} numberOfLines={1}>{post.foodName}</Text>
          {isAutoLog ? (
            <View style={[styles.autoBadge, { backgroundColor: theme.accent + '18' }]}>
              <Text style={[styles.autoBadgeText, { color: theme.accent }]}>Auto</Text>
            </View>
          ) : null}
          {post.mealType && (
            <View style={[styles.mealBadge, { backgroundColor: theme.primary + '18' }]}>
              <Text style={[styles.mealBadgeText, { color: theme.primary }]}>
                {MEAL_TYPE_LABELS[post.mealType] || post.mealType}
              </Text>
            </View>
          )}
        </View>
        {post.photoUri && !imageFailed ? (
          <Image
            source={{ uri: post.photoUri }}
            style={styles.postFoodImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : null}
        <View style={styles.macroRow}>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: theme.text }]}>{post.calories}</Text>
            <Text style={[styles.macroLabel, { color: theme.textTertiary }]}>kcal</Text>
          </View>
          <View style={[styles.macroDivider, { backgroundColor: theme.border }]} />
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: theme.primary }]}>{post.protein}g</Text>
            <Text style={[styles.macroLabel, { color: theme.textTertiary }]}>Protein</Text>
          </View>
          <View style={[styles.macroDivider, { backgroundColor: theme.border }]} />
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: theme.accent }]}>{post.carbs}g</Text>
            <Text style={[styles.macroLabel, { color: theme.textTertiary }]}>{l('Karbo', 'Carbs')}</Text>
          </View>
          <View style={[styles.macroDivider, { backgroundColor: theme.border }]} />
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: theme.warning }]}>{post.fat}g</Text>
            <Text style={[styles.macroLabel, { color: theme.textTertiary }]}>{l('Lemak', 'Fat')}</Text>
          </View>
        </View>
      </View>

      {false && (
        <View style={styles.postActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleLike} activeOpacity={0.7} testID={`post-like-${post.id}`}>
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
              <Heart
                size={19}
                color={isLiked ? '#E53E3E' : theme.textTertiary}
                fill={isLiked ? '#E53E3E' : 'transparent'}
              />
            </Animated.View>
            <Text style={[styles.actionCount, { color: isLiked ? '#E53E3E' : theme.textTertiary }]}>
              {post.likes.length}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onComment(post.id)}
            activeOpacity={0.7}
            testID={`post-comment-${post.id}`}
          >
            <MessageCircle size={19} color={theme.textTertiary} />
            <Text style={[styles.actionCount, { color: theme.textTertiary }]}>{post.commentCount}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

PostCard.displayName = 'PostCard';

type ChatMessage = {
  id: string;
  groupId: string;
  userId: string;
  displayName: string;
  avatarColor: string;
  message: string;
  createdAt: number;
};

type TimelineItem =
  | { type: 'post'; id: string; createdAt: number; post: FoodPost }
  | { type: 'chat'; id: string; createdAt: number; chat: ChatMessage };

export default function CommunityScreen() {
  const { theme } = useTheme();
  const { l } = useLanguage();
  const {
    posts, toggleLike, deletePost, hasProfile, communityProfile,
    hasJoinedGroup, activeGroup, joinedGroups,
    switchActiveGroup, joinedGroupIds,
  } = useCommunity();
  const { authState } = useNutrition();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const queryClient = useQueryClient();

  useFocusEffect(
    useCallback(() => {
      return () => setShowGroupPicker(false);
    }, []),
  );

  const currentUserId = communityProfile?.userId || authState.userId || null;

  const chatMessagesQuery = useQuery({
    queryKey: ['community_group_messages', activeGroup?.id || 'none'],
    enabled: !!activeGroup?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_group_messages')
        .select('id, group_id, user_id, message, created_at')
        .eq('group_id', activeGroup!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data || []) as Array<{
        id: string;
        group_id: string;
        user_id: string;
        message: string;
        created_at: string;
      }>;
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const { data: profilesData, error: profilesError } = await supabase
        .from('community_profiles')
        .select('user_id, display_name, avatar_color')
        .in('user_id', userIds.length > 0 ? userIds : ['00000000-0000-0000-0000-000000000000']);
      if (profilesError) throw profilesError;
      const profileMap = Object.fromEntries(
        ((profilesData || []) as Array<{ user_id: string; display_name: string; avatar_color: string }>).map((p) => [p.user_id, p])
      );
      return rows.map((r) => ({
        id: r.id,
        groupId: r.group_id,
        userId: r.user_id,
        displayName: profileMap[r.user_id]?.display_name || 'User',
        avatarColor: profileMap[r.user_id]?.avatar_color || '#22C55E',
        message: r.message,
        createdAt: new Date(r.created_at).getTime(),
      })) as ChatMessage[];
    },
  });

  const sendChatMutation = useMutation({
    mutationFn: async (message: string) => {
      if (!activeGroup?.id || !currentUserId) return;
      const { error } = await supabase.from('community_group_messages').insert({
        group_id: activeGroup.id,
        user_id: currentUserId,
        message,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['community_group_messages', activeGroup?.id || 'none'] });
    },
  });

  const chatMessages = useMemo<ChatMessage[]>(() => {
    return chatMessagesQuery.data || [];
  }, [chatMessagesQuery.data]);

  const handleCreatePost = useCallback(() => {
    console.log('community:create-post');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!authState.isSignedIn) {
      Alert.alert(l('Masuk Diperlukan', 'Sign In Required'), l('Silakan masuk terlebih dahulu untuk membuat post.', 'Please sign in first to create a post.'), [
        { text: l('Batal', 'Cancel'), style: 'cancel' },
        { text: l('Masuk', 'Sign In'), onPress: () => router.replace('/sign-in') },
      ]);
      return;
    }
    if (!hasProfile) {
      router.push('/setup-community-profile');
      return;
    }
    router.push('/create-post');
  }, [authState.isSignedIn, hasProfile, l]);

  const handleSettings = useCallback(() => {
    if (!activeGroup) return;
    console.log('community:group-settings', activeGroup.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/group-settings', params: { groupId: activeGroup.id } });
  }, [activeGroup]);

  const handleComment = useCallback((postId: string) => {
    console.log('community:comment', postId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/post-detail', params: { postId } });
  }, []);

  const handleLike = useCallback((postId: string) => {
    console.log('community:like', postId);
    if (!authState.isSignedIn) {
      Alert.alert(l('Masuk Diperlukan', 'Sign In Required'), l('Silakan masuk untuk menyukai post.', 'Please sign in to like posts.'));
      return;
    }
    if (!hasProfile) {
      router.push('/setup-community-profile');
      return;
    }
    toggleLike(postId);
  }, [authState.isSignedIn, hasProfile, toggleLike, l]);

  const handleRefresh = useCallback(async () => {
    console.log('community:refresh');
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['community_posts'] }),
      queryClient.invalidateQueries({ queryKey: ['community_comments'] }),
      queryClient.invalidateQueries({ queryKey: ['community_likes'] }),
      queryClient.invalidateQueries({ queryKey: ['community_group_messages', activeGroup?.id || 'none'] }),
      queryClient.invalidateQueries({ queryKey: ['community_premium_bypass_users'] }),
    ]);
    setTimeout(() => setRefreshing(false), 400);
  }, [queryClient, activeGroup?.id]);

  const handleSendChat = useCallback(() => {
    console.log('community:send-chat', chatInput);
    if (!chatInput.trim() || !activeGroup) return;
    sendChatMutation.mutate(chatInput.trim());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChatInput('');
  }, [chatInput, activeGroup, sendChatMutation]);

  const handleCreateGroup = useCallback(() => {
    console.log('community:create-group');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!authState.isSignedIn) {
      Alert.alert(l('Masuk Diperlukan', 'Sign In Required'), l('Silakan masuk terlebih dahulu.', 'Please sign in first.'), [
        { text: l('Batal', 'Cancel'), style: 'cancel' },
        { text: l('Masuk', 'Sign In'), onPress: () => router.replace('/sign-in') },
      ]);
      return;
    }
    if (!hasProfile) {
      router.push('/setup-community-profile');
      return;
    }
    router.push('/create-group');
  }, [authState.isSignedIn, hasProfile, l]);

  const handleGroupSettings = useCallback(() => {
    if (!activeGroup) return;
    console.log('community:group-settings', activeGroup.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/group-settings', params: { groupId: activeGroup.id } });
  }, [activeGroup]);

  const handleSwitchGroup = useCallback((groupId: string) => {
    console.log('community:switch-group', groupId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    switchActiveGroup(groupId);
    setShowGroupPicker(false);
  }, [switchActiveGroup]);

  const renderPost = useCallback(({ item }: { item: FoodPost }) => (
    <PostCard
      post={item}
      onLike={handleLike}
      onComment={handleComment}
      onDelete={deletePost}
      currentUserId={currentUserId}
      theme={theme}
      l={l}
    />
  ), [handleLike, handleComment, deletePost, currentUserId, theme, l]);

  const renderChatMessage = useCallback(({ item }: { item: ChatMessage }) => {
    const isMe = currentUserId === item.userId;
    return (
      <View style={[styles.chatRow, isMe ? styles.chatRowMe : styles.chatRowOther]}>
        {!isMe && <Avatar name={item.displayName} color={item.avatarColor} size={32} />}
        <View style={[styles.chatBubble, { backgroundColor: isMe ? theme.primary : theme.surfaceElevated, borderColor: theme.border }]}>
          <PremiumDisplayName
            text={item.displayName}
            premium={false}
            color={isMe ? '#FFFFFF' : theme.text}
            fontSize={12}
            fontWeight="700"
          />
          <Text style={[styles.chatMessage, { color: isMe ? '#FFFFFF' : theme.text }]}>{item.message}</Text>
          <Text style={[styles.chatTime, { color: isMe ? 'rgba(255,255,255,0.75)' : theme.textTertiary }]}>{timeAgo(item.createdAt)}</Text>
        </View>
      </View>
    );
  }, [currentUserId, theme]);

  const keyExtractor = useCallback((item: FoodPost) => item.id, []);

  const activeGroupPosts = useMemo(() => {
    if (!activeGroup) return [];
    return posts.filter(post => post.groupId === activeGroup.id);
  }, [posts, activeGroup]);

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const postItems: TimelineItem[] = activeGroupPosts.map((post) => ({
      type: 'post',
      id: `post-${post.id}`,
      createdAt: post.createdAt,
      post,
    }));
    const chatItems: TimelineItem[] = chatMessages.map((chat) => ({
      type: 'chat',
      id: `chat-${chat.id}`,
      createdAt: chat.createdAt,
      chat,
    }));
    return [...postItems, ...chatItems].sort((a, b) => a.createdAt - b.createdAt);
  }, [activeGroupPosts, chatMessages]);

  const renderTimelineItem = useCallback(({ item }: { item: TimelineItem }) => {
    if (item.type === 'post') {
      return (
        <PostCard
          post={item.post}
          onLike={handleLike}
          onComment={handleComment}
          onDelete={deletePost}
          currentUserId={currentUserId}
          theme={theme}
          l={l}
        />
      );
    }
    return renderChatMessage({ item: item.chat });
  }, [handleLike, handleComment, deletePost, currentUserId, theme, l, renderChatMessage]);

  const GroupPickerDropdown = showGroupPicker ? (
    <View style={[styles.groupPickerOverlay]}>
      <TouchableOpacity
        style={styles.groupPickerBackdrop}
        onPress={() => setShowGroupPicker(false)}
        activeOpacity={1}
      />
      <View style={[styles.groupPickerDropdown, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {joinedGroups.map(g => (
          <TouchableOpacity
            key={g.id}
            style={[
              styles.groupPickerItem,
              { borderColor: theme.border },
              g.id === activeGroup?.id && { backgroundColor: theme.primary + '10' },
            ]}
            onPress={() => handleSwitchGroup(g.id)}
            activeOpacity={0.7}
          >
            <Image source={{ uri: g.coverImage }} style={styles.groupPickerThumb} />
            <View style={styles.groupPickerInfo}>
              <Text style={[styles.groupPickerName, { color: theme.text }]} numberOfLines={1}>{g.name}</Text>
              <Text style={[styles.groupPickerMembers, { color: theme.textTertiary }]}>{g.members.length} {l('anggota', 'members')}</Text>
            </View>
            {g.id === activeGroup?.id && (
              <View style={[styles.groupPickerActive, { backgroundColor: theme.primary }]}>
                <Text style={styles.groupPickerActiveText}>{l('Aktif', 'Active')}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  ) : null;

  if (!authState.isSignedIn) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>{l('Komunitas', 'Community')}</Text>
          </View>

          <ScrollView
            style={styles.listFlex}
            contentContainerStyle={styles.noGroupScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.noGroupIconWrap, { backgroundColor: theme.primary + '12' }]}>
              <Users size={48} color={theme.primary} strokeWidth={1.5} />
            </View>
            <Text style={[styles.onboardingStepText, { color: theme.primary }]}>
              {l('Langkah 1 dari 3', 'Step 1 of 3')}
            </Text>
            <Text style={[styles.noGroupTitle, { color: theme.text }]}>{l('Masuk untuk Komunitas', 'Sign In to Community')}</Text>
            <Text style={[styles.noGroupDesc, { color: theme.textSecondary }]}>
              {l(
                'Masuk dulu untuk membuat profil komunitas, bergabung ke grup, dan berbagi progress.',
                'Sign in first to create your community profile, join groups, and share your progress.'
              )}
            </Text>

            <View style={styles.noGroupActions}>
              <TouchableOpacity
                style={[styles.joinGroupBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.replace('/sign-in');
                }}
                activeOpacity={0.8}
                testID="community-sign-in-required"
              >
                <Text style={styles.joinGroupBtnText}>{l('Masuk', 'Sign In')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </>
    );
  }

  if (!hasProfile) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>{l('Komunitas', 'Community')}</Text>
          </View>

          <ScrollView
            style={styles.listFlex}
            contentContainerStyle={styles.noGroupScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.noGroupIconWrap, { backgroundColor: theme.primary + '12' }]}>
              <UserPlus size={48} color={theme.primary} strokeWidth={1.5} />
            </View>
            <Text style={[styles.onboardingStepText, { color: theme.primary }]}>
              {l('Langkah 1 dari 2', 'Step 1 of 2')}
            </Text>
            <Text style={[styles.noGroupTitle, { color: theme.text }]}>{l('Buat Profil Komunitas', 'Create Community Profile')}</Text>
            <Text style={[styles.noGroupDesc, { color: theme.textSecondary }]}>
              {l(
                'Sebelum masuk ke fitur komunitas, buat username dan nama tampilan Anda dulu.',
                'Before entering community features, create your username and display name first.'
              )}
            </Text>

            <View style={styles.noGroupActions}>
              <TouchableOpacity
                style={[styles.joinGroupBtn, { backgroundColor: theme.primary }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push('/setup-community-profile');
                }}
                activeOpacity={0.8}
                testID="community-create-profile"
              >
                <Text style={styles.joinGroupBtnText}>{l('Buat Profil', 'Create Profile')}</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.noGroupFeatures, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.featuresTitle, { color: theme.text }]}>{l('Setelah profil siap', 'After profile setup')}</Text>
              {[
                { icon: <Users size={16} color={theme.primary} />, text: l('Buat atau gabung ke grup privat', 'Create or join private groups') },
                { icon: <Utensils size={16} color={theme.primary} />, text: l('Bagikan makanan dan progres', 'Share meals and progress') },
                { icon: <MessageCircle size={16} color={theme.primary} />, text: l('Chat dengan anggota grup', 'Chat with group members') },
              ].map((feature, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={[styles.featureIconWrap, { backgroundColor: theme.primary + '12' }]}>
                    {feature.icon}
                  </View>
                  <Text style={[styles.featureText, { color: theme.textSecondary }]}>{feature.text}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </>
    );
  }

  if (!hasJoinedGroup) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>{l('Komunitas', 'Community')}</Text>
          </View>

          <ScrollView
            style={styles.listFlex}
            contentContainerStyle={styles.noGroupScroll}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.noGroupIconWrap, { backgroundColor: theme.primary + '12' }]}>
              <Users size={48} color={theme.primary} strokeWidth={1.5} />
            </View>
            <Text style={[styles.onboardingStepText, { color: theme.primary }]}>
              {l('Langkah 2 dari 2', 'Step 2 of 2')}
            </Text>
            <Text style={[styles.noGroupTitle, { color: theme.text }]}>{l('Belum Ada Grup', 'No Group Yet')}</Text>
            <Text style={[styles.noGroupDesc, { color: theme.textSecondary }]}>
              {l('Fitur grup publik sedang dinonaktifkan. Untuk saat ini kamu hanya bisa membuat grup privat.', 'Public groups are currently disabled. For now you can only create private groups.')}
            </Text>

            <View style={styles.noGroupActions}>
              <TouchableOpacity
                style={[styles.createGroupBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={handleCreateGroup}
                activeOpacity={0.8}
                testID="community-create-group"
              >
                <Plus size={18} color={theme.primary} strokeWidth={2.5} />
                <Text style={[styles.createGroupBtnText, { color: theme.text }]}>{l('Buat Grup Baru', 'Create New Group')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createGroupBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={() => router.push('/browse-groups')}
                activeOpacity={0.8}
                testID="community-join-group-by-code"
              >
                <Search size={18} color={theme.primary} strokeWidth={2.5} />
                <Text style={[styles.createGroupBtnText, { color: theme.text }]}>{l('Gabung dengan Kode', 'Join with Code')}</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.noGroupFeatures, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.featuresTitle, { color: theme.text }]}>{l('Apa yang bisa kamu lakukan', 'What you can do')}</Text>
              {[
                { icon: <Globe size={16} color={theme.primary} />, text: l('Lihat feed makanan anggota grup privat', 'See private group members food feed') },
                { icon: <MessageCircle size={16} color={theme.primary} />, text: l('Chat dan diskusi nutrisi', 'Chat and nutrition discussion') },
                { icon: <UserPlus size={16} color={theme.primary} />, text: l('Undang teman ke grup kamu', 'Invite your friends to your group') },
              ].map((feature, i) => (
                <View key={i} style={styles.featureRow}>
                  <View style={[styles.featureIconWrap, { backgroundColor: theme.primary + '12' }]}>
                    {feature.icon}
                  </View>
                  <Text style={[styles.featureText, { color: theme.textSecondary }]}>{feature.text}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
            {joinedGroups.length > 1 ? (
              <TouchableOpacity
                style={styles.groupSwitcher}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowGroupPicker(!showGroupPicker);
                }}
                activeOpacity={0.7}
                testID="group-switcher"
              >
                <Text style={[styles.headerTitle, { color: theme.text }]}>
                  {activeGroup?.name || l('Komunitas', 'Community')}
                </Text>
                <ChevronDown size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            ) : (
              <Text style={[styles.headerTitle, { color: theme.text }]}>
                {activeGroup?.name || l('Komunitas', 'Community')}
              </Text>
            )}
            {activeGroup && (
              <TouchableOpacity
                style={[styles.settingsIconBtn, { backgroundColor: theme.primary }]}
                onPress={handleSettings}
                activeOpacity={0.8}
                testID="community-settings"
              >
                <Settings size={18} color="#FFFFFF" strokeWidth={2.5} />
              </TouchableOpacity>
            )}
          </View>

          {GroupPickerDropdown}

          <FlatList
            style={styles.listFlex}
            data={timelineItems}
            renderItem={renderTimelineItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: 120 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MessageCircle size={48} color={theme.textTertiary} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>{l('Belum Ada Aktivitas', 'No Activity Yet')}</Text>
                <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                  {l('Kirim chat atau upload post makanan pertama di grup ini.', 'Send a chat or upload the first meal post in this group.')}
                </Text>
              </View>
            }
          />

          <View style={[styles.chatInputWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.chatSend, { backgroundColor: theme.surfaceElevated, borderColor: theme.border, borderWidth: 1 }]}
              onPress={handleCreatePost}
              activeOpacity={0.8}
              testID="community-create-post-quick"
            >
              <Plus size={16} color={theme.primary} />
            </TouchableOpacity>
            <TextInput
              style={[styles.chatInput, { color: theme.text }]}
            placeholder=""
              placeholderTextColor={theme.textTertiary}
              value={chatInput}
              onChangeText={setChatInput}
              testID="community-chat-input"
            />
            <TouchableOpacity
              style={[styles.chatSend, { backgroundColor: theme.primary }]}
              onPress={handleSendChat}
              activeOpacity={0.8}
              testID="community-chat-send"
            >
              <Send size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

