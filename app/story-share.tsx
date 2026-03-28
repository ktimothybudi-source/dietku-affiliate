import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Share,
  Alert,
  Image,
  TextInput,
  Platform,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  X,
  MapPin,
  Check,
  ChevronRight,
  Clock,
  Heart,
  Utensils,
  User,
  Navigation,
  Edit3,
  MessageCircle,
  Link,
  Share2,
  Image as ImageIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { captureRef } from 'react-native-view-shot';
import { useTheme } from '@/contexts/ThemeContext';
import {
  StoryShareData,
  IncludeOptions,
  HealthRating,
  HEALTH_RATINGS,
} from '@/types/storyShare';
import { LOCATION_PRESETS } from '@/constants/storyShare';
import { ANIMATION_DURATION, SPRING_CONFIG } from '@/constants/animations';
import { storyShareStyles as styles } from '@/styles/storyShareStyles';

export default function StoryShareScreen() {
  const { theme, themeMode } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    mealName?: string;
    mealSubtitle?: string;
    calories?: string;
    protein?: string;
    carbs?: string;
    fat?: string;
    photoUri?: string;
    timestamp?: string;
    healthRating?: string;
  }>();

  const storyData: StoryShareData = {
    mealName: params.mealName || 'Delicious Meal',
    mealSubtitle: params.mealSubtitle,
    calories: parseInt(params.calories || '0'),
    protein: parseInt(params.protein || '0'),
    carbs: parseInt(params.carbs || '0'),
    fat: parseInt(params.fat || '0'),
    photoUri: params.photoUri,
    timestamp: parseInt(params.timestamp || Date.now().toString()),
  };

  const [customMealName, setCustomMealName] = useState(storyData.mealName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [includeOptions, setIncludeOptions] = useState<IncludeOptions>({
    macros: true,
    healthRating: true,
    location: false,
    time: false,
    name: true,
  });
  const healthRating: HealthRating = (params.healthRating as HealthRating) || 'sehat';
  const [locationName, setLocationName] = useState<string>('');
  const [showLocationSheet, setShowLocationSheet] = useState(false);
  const [customLocationInput, setCustomLocationInput] = useState('');
  const [showWatermark, setShowWatermark] = useState(true);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [isPreparingStory, setIsPreparingStory] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const locationSheetAnim = useRef(new Animated.Value(0)).current;
  const shareSheetAnim = useRef(new Animated.Value(0)).current;
  const previewRef = useRef<View>(null);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: ANIMATION_DURATION.slow,
      useNativeDriver: true,
    }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleOption = (key: keyof IncludeOptions) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (key === 'location' && !includeOptions.location) {
      setShowLocationSheet(true);
      openLocationSheet();
    } else {
      setIncludeOptions(prev => ({ ...prev, [key]: !prev[key] }));
    }
  };



  const openLocationSheet = () => {
    setShowLocationSheet(true);
    Animated.spring(locationSheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...SPRING_CONFIG.default,
    }).start();
  };

  const closeLocationSheet = () => {
    Animated.timing(locationSheetAnim, {
      toValue: 0,
      duration: ANIMATION_DURATION.standard,
      useNativeDriver: true,
    }).start(() => {
      setShowLocationSheet(false);
    });
  };

  const openShareSheet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowShareSheet(true);
    Animated.spring(shareSheetAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...SPRING_CONFIG.default,
    }).start();
  };

  const closeShareSheet = () => {
    Animated.timing(shareSheetAnim, {
      toValue: 0,
      duration: ANIMATION_DURATION.standard,
      useNativeDriver: true,
    }).start(() => {
      setShowShareSheet(false);
    });
  };

  const selectLocation = (name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLocationName(name);
    setIncludeOptions(prev => ({ ...prev, location: true }));
    closeLocationSheet();
  };

  const handleCustomLocation = () => {
    if (customLocationInput.trim()) {
      selectLocation(customLocationInput.trim());
      setCustomLocationInput('');
    }
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: ANIMATION_DURATION.standard,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: ANIMATION_DURATION.standard,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    });
  };

  const captureStoryImage = async (): Promise<string> => {
    if (!previewRef.current) throw new Error('Story preview belum siap.');
    const uri = await captureRef(previewRef, {
      format: 'jpg',
      quality: 0.95,
      result: 'tmpfile',
    });
    if (!uri) throw new Error('Gagal menangkap gambar story.');
    return uri;
  };

  const saveStoryImage = async (imageUri: string): Promise<void> => {
    const permission = await MediaLibrary.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new Error('Izin galeri diperlukan untuk menyimpan gambar.');
    }
    await MediaLibrary.saveToLibraryAsync(imageUri);
  };

  const openInstagramApp = async () => {
    const candidateUrls = ['instagram://camera', 'instagram://app'];
    for (const url of candidateUrls) {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
        return true;
      }
    }
    return false;
  };

  const openInstagramStoryComposer = async (imageUri: string) => {
    // react-native-share needs native RNShare — not in Expo Go; use EAS/dev build for IG Stories.
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
      throw new Error('EXPO_GO_NO_NATIVE_SHARE');
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-share') as { default?: typeof import('react-native-share').default };
    const ShareLib = mod.default ?? mod;
    await ShareLib.shareSingle({
      social: ShareLib.Social.INSTAGRAM_STORIES as any,
      backgroundImage: imageUri,
      appId: 'app.rork.dietku-clone-jlejfwy',
    });
  };

  const handleShareInstagram = async () => {
    if (isPreparingStory) return;
    setIsPreparingStory(true);
    try {
      const imageUri = await captureStoryImage();
      await saveStoryImage(imageUri);
      try {
        await openInstagramStoryComposer(imageUri);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (storyError) {
        console.warn('Instagram Story composer failed, falling back to opening app:', storyError);
        const opened = await openInstagramApp();
        if (opened) {
          Alert.alert(
            'Foto Tersimpan',
            'Instagram dibuka. Pilih foto yang baru disimpan dari galeri untuk Story kamu.'
          );
        } else {
          Alert.alert(
            'Instagram Tidak Ditemukan',
            'Foto sudah disimpan ke galeri. Install Instagram lalu pilih foto ini dari Story.'
          );
        }
      }
    } catch (error) {
      console.error('Share Instagram error:', error);
      const message = error instanceof Error ? error.message : 'Gagal menyiapkan story.';
      Alert.alert('Gagal Share Story', message);
    } finally {
      setIsPreparingStory(false);
    }
  };

  const handleSaveImage = async () => {
    if (isPreparingStory) return;
    setIsPreparingStory(true);
    try {
      const imageUri = await captureStoryImage();
      await saveStoryImage(imageUri);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Berhasil', 'Story berhasil disimpan ke galeri.');
    } catch (error) {
      console.error('Save story image error:', error);
      const message = error instanceof Error ? error.message : 'Gagal menyimpan gambar.';
      Alert.alert('Gagal Simpan', message);
    } finally {
      setIsPreparingStory(false);
    }
  };

  const handleMoreOptions = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await Share.share({
        message: `${customMealName} - ${storyData.calories} kcal 🔥${showWatermark ? '\n\nTracked with DietKu' : ''}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };

  const currentHealthRating = HEALTH_RATINGS.find(r => r.id === healthRating);

  const renderShareSheet = () => {
    if (!showShareSheet) return null;

    return (
      <View style={styles.sheetOverlay}>
        <TouchableOpacity
          style={styles.sheetBackdrop}
          onPress={closeShareSheet}
          activeOpacity={1}
        />
        <Animated.View
          style={[
            styles.shareSheet,
            {
              backgroundColor: theme.card,
              transform: [
                {
                  translateY: shareSheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [400, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
          <Text style={[styles.sheetTitle, { color: theme.text }]}>Share to</Text>

          <View style={styles.shareGrid}>
            <TouchableOpacity style={styles.shareAppItem} onPress={() => { closeShareSheet(); void handleShareInstagram(); }}>
              <LinearGradient
                colors={['#833AB4', '#E1306C', '#F77737']}
                style={styles.shareAppIcon}
              >
                <Text style={styles.shareAppEmoji}>📸</Text>
              </LinearGradient>
              <Text style={[styles.shareAppLabel, { color: theme.textSecondary }]}>Instagram{"\n"}Story</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareAppItem} onPress={() => { closeShareSheet(); void handleShareInstagram(); }}>
              <LinearGradient
                colors={['#833AB4', '#E1306C', '#F77737']}
                style={styles.shareAppIcon}
              >
                <MessageCircle size={24} color="#FFFFFF" />
              </LinearGradient>
              <Text style={[styles.shareAppLabel, { color: theme.textSecondary }]}>Instagram{"\n"}Messages</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareAppItem} onPress={() => { closeShareSheet(); handleMoreOptions(); }}>
              <View style={[styles.shareAppIcon, { backgroundColor: '#25D366' }]}>
                <Text style={styles.shareAppEmoji}>💬</Text>
              </View>
              <Text style={[styles.shareAppLabel, { color: theme.textSecondary }]}>WhatsApp</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareAppItem} onPress={() => { closeShareSheet(); handleMoreOptions(); }}>
              <View style={[styles.shareAppIcon, { backgroundColor: '#34C759' }]}>
                <MessageCircle size={24} color="#FFFFFF" />
              </View>
              <Text style={[styles.shareAppLabel, { color: theme.textSecondary }]}>Message</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareAppItem} onPress={() => { closeShareSheet(); void handleSaveImage(); }}>
              <View
                style={[
                  styles.shareAppIcon,
                  styles.shareAppIconOutline,
                  { backgroundColor: themeMode === 'light' ? theme.surfaceElevated : 'rgba(255,255,255,0.1)' },
                ]}
              >
                <ImageIcon size={24} color={theme.text} />
              </View>
              <Text style={[styles.shareAppLabel, { color: theme.textSecondary }]}>Save{"\n"}Image</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareAppItem} onPress={() => { closeShareSheet(); handleMoreOptions(); }}>
              <View
                style={[
                  styles.shareAppIcon,
                  styles.shareAppIconOutline,
                  { backgroundColor: themeMode === 'light' ? theme.surfaceElevated : 'rgba(255,255,255,0.1)' },
                ]}
              >
                <Link size={24} color={theme.text} />
              </View>
              <Text style={[styles.shareAppLabel, { color: theme.textSecondary }]}>Copy{"\n"}Link</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareAppItem} onPress={() => { closeShareSheet(); handleMoreOptions(); }}>
              <View
                style={[
                  styles.shareAppIcon,
                  styles.shareAppIconOutline,
                  { backgroundColor: themeMode === 'light' ? theme.surfaceElevated : 'rgba(255,255,255,0.1)' },
                ]}
              >
                <Share2 size={24} color={theme.text} />
              </View>
              <Text style={[styles.shareAppLabel, { color: theme.textSecondary }]}>More</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    );
  };

  const hasAnyPills = includeOptions.healthRating && currentHealthRating;

  const renderPreview = () => (
    <View
      ref={previewRef}
      collapsable={false}
      style={[
        styles.previewContainer,
        { backgroundColor: themeMode === 'light' ? theme.border : '#1a1a2e' },
      ]}
    >
      {storyData.photoUri ? (
        <Image
          source={{ uri: storyData.photoUri }}
          style={styles.previewImage}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={
            themeMode === 'light'
              ? [theme.surfaceElevated, theme.border, theme.card]
              : ['#1a1a2e', '#16213e', '#0f0f23']
          }
          style={styles.previewImage}
        />
      )}
      
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.4, 1]}
        style={styles.previewGradient}
      />

      {(includeOptions.location && locationName) || includeOptions.time ? (
        <View style={styles.topInfoContainer}>
          {includeOptions.time && (
            <View style={styles.topInfoPill}>
              <Text style={styles.topInfoText}>🕐 {formatTime(storyData.timestamp)}</Text>
            </View>
          )}
          {includeOptions.location && locationName && (
            <View style={styles.topInfoPill}>
              <Text style={styles.topInfoText}>📍 {locationName}</Text>
            </View>
          )}
        </View>
      ) : null}

      <View style={[
        styles.previewContent,
        !includeOptions.name && !includeOptions.macros && !hasAnyPills && styles.previewContentMinimal
      ]}>
        {includeOptions.name && (
          <Text style={[
            styles.previewMealName,
            !includeOptions.macros && !hasAnyPills && styles.previewMealNameLarge
          ]}>
            {customMealName}
          </Text>
        )}

        <View style={styles.caloriesBlock}>
          <Text style={[
            styles.previewCalories,
            !includeOptions.name && !includeOptions.macros && styles.previewCaloriesHero
          ]}>
            {storyData.calories}
            <Text style={styles.previewCaloriesUnit}> kcal</Text>
          </Text>
          
          {showWatermark && (
            <View style={styles.trackedByContainer}>
              <Text style={styles.trackedByText}>
                Tracked with <Text style={[styles.trackedByBrand, { color: theme.primary }]}>DietKu</Text>
              </Text>
            </View>
          )}
        </View>

        {includeOptions.macros && (
          <View style={[
            styles.macroChips,
            !hasAnyPills && styles.macroChipsSpaced
          ]}>
            <View style={styles.macroChip}>
              <Text style={styles.macroChipText}>💪 {storyData.protein}g</Text>
            </View>
            <View style={styles.macroChip}>
              <Text style={styles.macroChipText}>🍞 {storyData.carbs}g</Text>
            </View>
            <View style={styles.macroChip}>
              <Text style={styles.macroChipText}>🥑 {storyData.fat}g</Text>
            </View>
          </View>
        )}

        {hasAnyPills && (
          <View style={styles.previewPills}>
            {includeOptions.healthRating && currentHealthRating && (
              <View style={[styles.previewPill, { backgroundColor: `${currentHealthRating.color}20` }]}>
                <Text style={styles.previewPillText}>
                  {currentHealthRating.icon} {currentHealthRating.label}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );

  const renderToggleRow = (
    key: keyof IncludeOptions,
    icon: React.ReactNode,
    label: string,
    subtitle?: string,
    onTap?: () => void,
    showHighlight?: boolean
  ) => {
    const isActive = includeOptions[key];
    return (
      <TouchableOpacity
        style={[styles.toggleRow, { borderBottomColor: theme.border }]}
        onPress={onTap || (() => toggleOption(key))}
        activeOpacity={0.7}
      >
        <View style={styles.toggleLeft}>
          <View
            style={[
              styles.toggleIcon,
              { backgroundColor: themeMode === 'light' ? theme.surfaceElevated : 'rgba(255,255,255,0.1)' },
              showHighlight && isActive && {
                backgroundColor:
                  themeMode === 'light' ? `${theme.primary}28` : 'rgba(108, 99, 255, 0.3)',
              },
            ]}
          >
            {icon}
          </View>
          <View>
            <Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text>
            {subtitle && <Text style={[styles.toggleSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>}
          </View>
        </View>
        <View
          style={[
            styles.toggleCheck,
            { borderColor: theme.border },
            isActive && styles.toggleCheckActive,
          ]}
        >
          {isActive && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
        </View>
      </TouchableOpacity>
    );
  };

  const renderIncludePanel = () => (
    <View
      style={[
        styles.includePanel,
        {
          backgroundColor: themeMode === 'light' ? theme.surfaceElevated : 'rgba(255,255,255,0.05)',
          borderWidth: themeMode === 'light' ? 1 : 0,
          borderColor: theme.border,
        },
      ]}
    >
      <Text style={[styles.includePanelTitle, { color: theme.text }]}>Include On Story</Text>

      <TouchableOpacity
        style={[styles.toggleRow, { borderBottomColor: theme.border }]}
        onPress={() => toggleOption('name')}
        activeOpacity={0.7}
      >
        <View style={styles.toggleLeft}>
          <View
            style={[
              styles.toggleIcon,
              { backgroundColor: themeMode === 'light' ? theme.surfaceElevated : 'rgba(255,255,255,0.1)' },
              includeOptions.name && {
                backgroundColor:
                  themeMode === 'light' ? `${theme.primary}28` : 'rgba(108, 99, 255, 0.3)',
              },
            ]}
          >
            <User
              size={18}
              color={includeOptions.name ? '#FFFFFF' : theme.textSecondary}
            />
          </View>
          <View style={styles.toggleTextContainer}>
            <Text style={[styles.toggleLabel, { color: theme.text }]}>Meal Name</Text>
            {isEditingName ? (
              <TextInput
                style={[styles.nameEditInput, { color: theme.primary, borderBottomColor: theme.primary }]}
                value={customMealName}
                onChangeText={setCustomMealName}
                onBlur={() => setIsEditingName(false)}
                onSubmitEditing={() => setIsEditingName(false)}
                autoFocus
                placeholder="Enter meal name"
                placeholderTextColor={theme.textTertiary}
              />
            ) : (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setIsEditingName(true);
                }}
                style={styles.nameEditTouchable}
              >
                <Text style={[styles.toggleSubtitle, { color: theme.textSecondary }]}>{customMealName}</Text>
                <Edit3 size={12} color={theme.primary} style={styles.editIcon} />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View
          style={[
            styles.toggleCheck,
            { borderColor: theme.border },
            includeOptions.name && styles.toggleCheckActive,
          ]}
        >
          {includeOptions.name && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
        </View>
      </TouchableOpacity>

      {renderToggleRow(
        'macros',
        <Utensils size={18} color={includeOptions.macros ? '#FFFFFF' : theme.textSecondary} />,
        'Macros',
        `${storyData.protein}g P • ${storyData.carbs}g C • ${storyData.fat}g F`,
        undefined,
        true
      )}

      {renderToggleRow(
        'healthRating',
        <Heart size={18} color={includeOptions.healthRating ? '#FFFFFF' : theme.textSecondary} />,
        'Health Rating',
        currentHealthRating?.label,
        undefined,
        true
      )}

      {renderToggleRow(
        'location',
        <MapPin size={18} color={includeOptions.location ? '#FFFFFF' : theme.textSecondary} />,
        'Location',
        locationName || 'Tap to add',
        () => {
          if (includeOptions.location) {
            openLocationSheet();
          } else {
            toggleOption('location');
          }
        },
        true
      )}

      {renderToggleRow(
        'time',
        <Clock size={18} color={includeOptions.time ? '#FFFFFF' : theme.textSecondary} />,
        'Time',
        formatTime(storyData.timestamp),
        undefined,
        true
      )}

      <TouchableOpacity
        style={styles.watermarkRow}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowWatermark(!showWatermark);
        }}
        activeOpacity={0.7}
      >
        <Text style={[styles.watermarkLabel, { color: theme.textTertiary }]}>Show Tracked with DietKu</Text>
        <View
          style={[
            styles.toggleCheck,
            { borderColor: theme.border },
            showWatermark && styles.toggleCheckActive,
          ]}
        >
          {showWatermark && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderLocationSheet = () => {
    if (!showLocationSheet) return null;

    return (
      <View style={styles.sheetOverlay}>
        <TouchableOpacity
          style={styles.sheetBackdrop}
          onPress={closeLocationSheet}
          activeOpacity={1}
        />
        <Animated.View
          style={[
            styles.locationSheet,
            {
              backgroundColor: theme.card,
              transform: [
                {
                  translateY: locationSheetAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [400, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: theme.border }]} />
          <Text style={[styles.sheetTitle, { color: theme.text }]}>Add Location</Text>

          <TouchableOpacity
            style={[styles.locationOption, { borderBottomColor: theme.border }]}
            onPress={async () => {
              try {
                setIsLoadingLocation(true);
                
                if (Platform.OS === 'web') {
                  // Web geolocation
                  if ('geolocation' in navigator) {
                    navigator.geolocation.getCurrentPosition(
                      async (position) => {
                        const { latitude, longitude } = position.coords;
                        try {
                          const response = await fetch(
                            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
                          );
                          const data = await response.json();
                          const locationStr = data.address?.city || data.address?.town || data.address?.village || data.display_name?.split(',')[0] || 'Current Location';
                          selectLocation(locationStr);
                        } catch {
                          selectLocation('Current Location');
                        }
                        setIsLoadingLocation(false);
                      },
                      (error) => {
                        console.log('Web location error:', error);
                        Alert.alert('Location Error', 'Unable to get your location. Please enable location access.');
                        setIsLoadingLocation(false);
                      }
                    );
                  } else {
                    Alert.alert('Location Error', 'Location is not supported on this browser.');
                    setIsLoadingLocation(false);
                  }
                } else {
                  // Native location with expo-location
                  const { status } = await Location.requestForegroundPermissionsAsync();
                  
                  if (status !== 'granted') {
                    Alert.alert(
                      'Location Permission Required',
                      'Please allow location access to use this feature.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Settings', onPress: () => Location.requestForegroundPermissionsAsync() }
                      ]
                    );
                    setIsLoadingLocation(false);
                    return;
                  }
                  
                  const location = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                  });
                  
                  const [address] = await Location.reverseGeocodeAsync({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                  });
                  
                  if (address) {
                    const locationStr = address.city || address.subregion || address.region || address.district || 'Current Location';
                    selectLocation(locationStr);
                  } else {
                    selectLocation('Current Location');
                  }
                  setIsLoadingLocation(false);
                }
                
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              } catch (error) {
                console.log('Location error:', error);
                Alert.alert('Location Error', 'Unable to get your location. Please try again.');
                setIsLoadingLocation(false);
              }
            }}
            activeOpacity={0.7}
            disabled={isLoadingLocation}
          >
            <View style={styles.locationOptionIcon}>
              <Navigation size={20} color="#22C55E" />
            </View>
            <Text style={[styles.locationOptionText, { color: theme.text }]}>
              {isLoadingLocation ? 'Getting location...' : 'Use current location'}
            </Text>
            <ChevronRight size={20} color={theme.textTertiary} />
          </TouchableOpacity>

          <View style={[styles.customLocationRow, { borderBottomColor: theme.border }]}>
            <View style={styles.customLocationIcon}>
              <Edit3 size={18} color="#EC4899" />
            </View>
            <TextInput
              style={[styles.customLocationInput, { color: theme.text }]}
              placeholder="Enter custom location..."
              placeholderTextColor={theme.textTertiary}
              value={customLocationInput}
              onChangeText={setCustomLocationInput}
              onSubmitEditing={handleCustomLocation}
              returnKeyType="done"
            />
            {customLocationInput.trim() && (
              <TouchableOpacity onPress={handleCustomLocation}>
                <Text style={styles.addLocationBtn}>Add</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.presetsTitle, { color: theme.textSecondary }]}>Quick Select</Text>
          <View style={styles.presetsGrid}>
            {LOCATION_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.id}
                style={[
                  styles.presetChip,
                  { backgroundColor: themeMode === 'light' ? theme.surfaceElevated : 'rgba(255,255,255,0.08)' },
                ]}
                onPress={() => selectLocation(preset.name)}
                activeOpacity={0.7}
              >
                <Text style={styles.presetIcon}>{preset.icon}</Text>
                <Text style={[styles.presetText, { color: theme.text }]}>{preset.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {locationName && (
            <TouchableOpacity
              style={styles.removeLocationBtn}
              onPress={() => {
                setLocationName('');
                setIncludeOptions(prev => ({ ...prev, location: false }));
                closeLocationSheet();
              }}
            >
              <Text style={styles.removeLocationText}>Remove Location</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <LinearGradient
          colors={
            themeMode === 'light'
              ? [theme.background, theme.surfaceElevated, theme.background]
              : ['#0a0a0f', '#12121a', '#0a0a0f']
          }
          style={StyleSheet.absoluteFill}
        />

        <Animated.View style={[styles.header, { paddingTop: insets.top + 8, opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <TouchableOpacity
            style={[
              styles.closeButton,
              {
                backgroundColor:
                  themeMode === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.1)',
              },
            ]}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <X size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Share Story</Text>
          <TouchableOpacity
            style={[
              styles.headerShareButton,
              { backgroundColor: themeMode === 'light' ? `${theme.primary}30` : 'rgba(108, 99, 255, 0.3)' },
            ]}
            onPress={openShareSheet}
            activeOpacity={0.7}
            disabled={isPreparingStory}
          >
            {isPreparingStory ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Share2 size={20} color={theme.primary} />
            )}
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}>
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={[styles.scrollContentContainer, { paddingBottom: insets.bottom + 40 }]}
            showsVerticalScrollIndicator={false}
          >
            {renderPreview()}

            {renderIncludePanel()}
          </ScrollView>
        </Animated.View>

        {renderLocationSheet()}
        {renderShareSheet()}
      </View>
    </>
  );
}

