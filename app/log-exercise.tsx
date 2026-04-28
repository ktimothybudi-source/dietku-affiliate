import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { ArrowLeft, X, Check, Flame, Clock, Zap, MessageSquare, Edit3, Footprints } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useExercise } from '@/contexts/ExerciseContext';
import { QUICK_EXERCISES, QuickExercise, ExerciseType } from '@/types/exercise';
import { estimateExerciseFromText } from '@/utils/exerciseAi';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function LogExerciseScreen() {
  const { theme } = useTheme();
  const { l } = useLanguage();
  const { addExercise, todaySteps, todayExercises, deleteExercise, totalCaloriesBurned, stepsCaloriesBurned, exerciseCaloriesBurned, healthConnectEnabled, enableHealthConnect, disableHealthConnect, pedometerAvailable } = useExercise();
  const insets = useSafeAreaInsets();

  const [activeMode, setActiveMode] = useState<'quick' | 'describe' | 'manual' | 'steps'>('quick');
  const [selectedExercise, setSelectedExercise] = useState<QuickExercise | null>(null);
  const [duration, setDuration] = useState('');
  const [description, setDescription] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualCalories, setManualCalories] = useState('');
  const [manualDuration, setManualDuration] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const animatePress = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  }, [scaleAnim]);

  const handleSelectQuickExercise = (exercise: QuickExercise) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedExercise(exercise);
    setDuration('');
  };

  const handleLogQuickExercise = () => {
    if (!selectedExercise || !duration) return;
    const mins = parseInt(duration);
    if (isNaN(mins) || mins <= 0) return;

    const calories = Math.round(selectedExercise.caloriesPerMinute * mins);
    addExercise({
      type: selectedExercise.type,
      name: selectedExercise.label,
      caloriesBurned: calories,
      duration: mins,
    });
    animatePress();
    setSelectedExercise(null);
    setDuration('');
  };

  const handleDescribeExercise = async () => {
    if (!description.trim()) return;

    setIsAnalyzing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const parsed = await estimateExerciseFromText(description.trim());

      addExercise({
        type: 'describe' as ExerciseType,
        name: parsed.name || description.trim().slice(0, 30),
        caloriesBurned: parsed.calories || 150,
        description: description.trim(),
      });
      setDescription('');
    } catch (error) {
      console.error('Exercise describe error:', error);
      addExercise({
        type: 'describe' as ExerciseType,
        name: description.trim().slice(0, 30),
        caloriesBurned: 150,
        description: description.trim(),
      });
      setDescription('');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleManualLog = () => {
    if (!manualName.trim() || !manualCalories) return;
    const cals = parseInt(manualCalories);
    if (isNaN(cals) || cals <= 0) return;

    addExercise({
      type: 'manual' as ExerciseType,
      name: manualName.trim(),
      caloriesBurned: cals,
      duration: manualDuration ? parseInt(manualDuration) : undefined,
    });
    animatePress();
    setManualName('');
    setManualCalories('');
    setManualDuration('');
  };


  const handleDeleteExercise = (id: string, date: string) => {
    Alert.alert(
      l('Hapus Olahraga', 'Delete Exercise'),
      l('Yakin ingin menghapus aktivitas ini?', 'Are you sure you want to delete this activity?'),
      [
        { text: l('Batal', 'Cancel'), style: 'cancel' },
        { text: l('Hapus', 'Delete'), style: 'destructive', onPress: () => deleteExercise(id, date) },
      ]
    );
  };

  const modes = [
    { key: 'quick' as const, label: l('Cepat', 'Quick'), icon: Zap },
    { key: 'describe' as const, label: l('Jelaskan', 'Describe'), icon: MessageSquare },
    { key: 'manual' as const, label: l('Manual', 'Manual'), icon: Edit3 },
    { key: 'steps' as const, label: l('Langkah', 'Steps'), icon: Footprints },
  ];

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: theme.card }]}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <ArrowLeft size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{l('Catat Olahraga', 'Log Exercise')}</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Flame size={20} color="#EF4444" />
              <Text style={[styles.summaryValue, { color: theme.text }]}>{totalCaloriesBurned}</Text>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{l('kcal total', 'total kcal')}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />
            <View style={styles.summaryItem}>
              <Footprints size={20} color="#3B82F6" />
              <Text style={[styles.summaryValue, { color: theme.text }]}>{todaySteps.toLocaleString()}</Text>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{l('langkah', 'steps')}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.border }]} />
            <View style={styles.summaryItem}>
              <Zap size={20} color="#F59E0B" />
              <Text style={[styles.summaryValue, { color: theme.text }]}>{todayExercises.length}</Text>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{l('aktivitas', 'activities')}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.modeSelector, { backgroundColor: theme.card }]}>
          {modes.map((mode) => {
            const IconComp = mode.icon;
            const isActive = activeMode === mode.key;
            return (
              <TouchableOpacity
                key={mode.key}
                style={[styles.modeTab, isActive && { backgroundColor: theme.primary }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveMode(mode.key);
                }}
                activeOpacity={0.7}
              >
                <IconComp size={16} color={isActive ? '#FFFFFF' : theme.textSecondary} />
                <Text style={[styles.modeTabText, { color: isActive ? '#FFFFFF' : theme.textSecondary }]}>
                  {mode.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {activeMode === 'quick' && (
              <View style={styles.modeContent}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{l('Pilih Aktivitas', 'Choose Activity')}</Text>
                <View style={styles.exerciseGrid}>
                  {QUICK_EXERCISES.map((exercise) => {
                    const isSelected = selectedExercise?.type === exercise.type;
                    return (
                      <TouchableOpacity
                        key={exercise.type}
                        style={[
                          styles.exerciseCard,
                          { backgroundColor: theme.card, borderColor: isSelected ? theme.primary : theme.border },
                          isSelected && { borderWidth: 2 },
                        ]}
                        onPress={() => handleSelectQuickExercise(exercise)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.exerciseEmoji}>{exercise.emoji}</Text>
                        <Text style={[styles.exerciseName, { color: theme.text }]}>{exercise.label}</Text>
                        <Text style={[styles.exerciseCal, { color: theme.textTertiary }]}>
                          ~{exercise.caloriesPerMinute} kcal/min
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {selectedExercise && (
                  <View style={[styles.durationSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    <Text style={[styles.durationLabel, { color: theme.text }]}>
                      {selectedExercise.emoji} {selectedExercise.label} — Berapa menit?
                    </Text>
                    <View style={styles.durationInputRow}>
                      <View style={[styles.durationInputWrapper, { backgroundColor: theme.background, borderColor: theme.border }]}>
                        <TextInput
                          style={[styles.durationInput, { color: theme.text }]}
                          placeholder="30"
                          placeholderTextColor={theme.textTertiary}
                          keyboardType="number-pad"
                          value={duration}
                          onChangeText={setDuration}
                          autoFocus
                        />
                        <Text style={[styles.durationUnit, { color: theme.textSecondary }]}>{l('menit', 'minutes')}</Text>
                      </View>
                      <TouchableOpacity
                        style={[styles.logButton, (!duration || parseInt(duration) <= 0) && styles.logButtonDisabled]}
                        onPress={handleLogQuickExercise}
                        disabled={!duration || parseInt(duration) <= 0}
                        activeOpacity={0.8}
                      >
                        <Check size={20} color="#FFFFFF" />
                        <Text style={styles.logButtonText}>{l('Catat', 'Log')}</Text>
                      </TouchableOpacity>
                    </View>
                    {duration && parseInt(duration) > 0 && (
                      <View style={styles.estimateRow}>
                        <Flame size={14} color="#EF4444" />
                        <Text style={[styles.estimateText, { color: theme.textSecondary }]}>
                          {l('Estimasi', 'Estimate')}: ~{Math.round(selectedExercise.caloriesPerMinute * parseInt(duration))} kcal
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {activeMode === 'describe' && (
              <View style={styles.modeContent}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{l('Jelaskan Aktivitas Anda', 'Describe Your Activity')}</Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                  {l('AI akan mengestimasi kalori yang terbakar', 'AI will estimate calories burned')}
                </Text>
                <View style={[styles.describeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <TextInput
                    style={[styles.describeInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                    placeholder={l('contoh: Renang 5 lap di kolam 50m, lari 3km di treadmill...', 'example: Swim 5 laps in a 50m pool, run 3km on a treadmill...')}
                    placeholderTextColor={theme.textTertiary}
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={[styles.describeButton, (!description.trim() || isAnalyzing) && styles.logButtonDisabled]}
                    onPress={handleDescribeExercise}
                    disabled={!description.trim() || isAnalyzing}
                    activeOpacity={0.8}
                  >
                    {isAnalyzing ? (
                      <>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                        <Text style={styles.logButtonText}>{l('Menganalisis...', 'Analyzing...')}</Text>
                      </>
                    ) : (
                      <>
                        <MessageSquare size={18} color="#FFFFFF" />
                        <Text style={styles.logButtonText}>{l('Estimasi & Catat', 'Estimate & Log')}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {activeMode === 'manual' && (
              <View style={styles.modeContent}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{l('Input Manual', 'Manual Input')}</Text>
                <View style={[styles.manualCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.manualField}>
                    <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{l('Nama Aktivitas', 'Activity Name')}</Text>
                    <TextInput
                      style={[styles.fieldInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                      placeholder={l('contoh: Jogging pagi', 'example: Morning jogging')}
                      placeholderTextColor={theme.textTertiary}
                      value={manualName}
                      onChangeText={setManualName}
                    />
                  </View>
                  <View style={styles.manualFieldRow}>
                    <View style={[styles.manualField, styles.flex]}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{l('Kalori (kcal)', 'Calories (kcal)')}</Text>
                      <TextInput
                        style={[styles.fieldInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                        placeholder="250"
                        placeholderTextColor={theme.textTertiary}
                        keyboardType="number-pad"
                        value={manualCalories}
                        onChangeText={setManualCalories}
                      />
                    </View>
                    <View style={[styles.manualField, styles.flex]}>
                      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{l('Durasi (menit)', 'Duration (minutes)')}</Text>
                      <TextInput
                        style={[styles.fieldInput, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
                        placeholder="30"
                        placeholderTextColor={theme.textTertiary}
                        keyboardType="number-pad"
                        value={manualDuration}
                        onChangeText={setManualDuration}
                      />
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.logButton, styles.fullWidth, (!manualName.trim() || !manualCalories) && styles.logButtonDisabled]}
                    onPress={handleManualLog}
                    disabled={!manualName.trim() || !manualCalories}
                    activeOpacity={0.8}
                  >
                    <Check size={20} color="#FFFFFF" />
                    <Text style={styles.logButtonText}>{l('Catat Aktivitas', 'Log Activity')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {activeMode === 'steps' && (
              <View style={styles.modeContent}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{l('Langkah', 'Steps')}</Text>
                <View style={[styles.stepsCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.stepsDisplay}>
                    <Footprints size={32} color="#3B82F6" />
                    <Text style={[styles.stepsCount, { color: theme.text }]}>{todaySteps.toLocaleString()}</Text>
                    <Text style={[styles.stepsLabel, { color: theme.textSecondary }]}>{l('langkah hari ini', 'steps today')}</Text>
                    <Text style={[styles.stepsCal, { color: theme.textTertiary }]}>
                      ~{stepsCaloriesBurned} {l('kcal terbakar', 'kcal burned')}
                    </Text>
                  </View>

                  <View style={[styles.healthConnectSection, { borderTopColor: theme.border }]}>
                    <Text style={[styles.healthConnectTitle, { color: theme.text }]}>
                      {Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'}
                    </Text>
                    <Text style={[styles.healthConnectDesc, { color: theme.textSecondary }]}>
                      {healthConnectEnabled
                        ? l(`Terhubung ke ${Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'}. Langkah diambil otomatis dari perangkat Anda.`, `Connected to ${Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'}. Steps are synced automatically from your device.`)
                        : l(`Hubungkan ke ${Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'} untuk melacak langkah secara otomatis.`, `Connect to ${Platform.OS === 'ios' ? 'Apple Health' : 'Health Connect'} to track steps automatically.`)
                      }
                    </Text>
                    {!pedometerAvailable && Platform.OS !== 'web' && (
                      <Text style={[styles.healthConnectWarning, { color: '#F59E0B' }]}>
                        {l('Pedometer tidak tersedia di perangkat ini.', 'Pedometer is not available on this device.')}
                      </Text>
                    )}
                    <TouchableOpacity
                      style={[
                        styles.healthConnectBtn,
                        { backgroundColor: healthConnectEnabled ? 'rgba(239, 68, 68, 0.1)' : theme.primary },
                      ]}
                      onPress={() => {
                        if (healthConnectEnabled) {
                          disableHealthConnect();
                        } else {
                          enableHealthConnect();
                        }
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.healthConnectBtnText,
                        { color: healthConnectEnabled ? '#EF4444' : '#FFFFFF' },
                      ]}>
                        {healthConnectEnabled ? l('Putuskan Koneksi', 'Disconnect') : l('Hubungkan', 'Connect')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {todayExercises.length > 0 && (
              <View style={styles.historySection}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{l('Aktivitas Hari Ini', 'Today Activities')}</Text>
                {todayExercises.map((exercise) => (
                  <View
                    key={exercise.id}
                    style={[styles.historyItem, { backgroundColor: theme.card, borderColor: theme.border }]}
                  >
                    <View style={styles.historyItemInfo}>
                      <Text style={[styles.historyItemName, { color: theme.text }]}>{exercise.name}</Text>
                      <Text style={[styles.historyItemDetails, { color: theme.textSecondary }]}>
                        {exercise.caloriesBurned} kcal
                        {exercise.duration ? ` • ${exercise.duration} min` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteExercise(exercise.id, exercise.date)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <X size={18} color={theme.textTertiary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  summaryCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '500' as const,
  },
  summaryDivider: {
    width: 1,
    height: 36,
  },
  modeSelector: {
    flexDirection: 'row',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  modeContent: {
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  sectionSubtitle: {
    fontSize: 14,
    marginTop: -8,
  },
  exerciseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  exerciseCard: {
    width: '31%',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
  },
  exerciseEmoji: {
    fontSize: 28,
  },
  exerciseName: {
    fontSize: 13,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },
  exerciseCal: {
    fontSize: 10,
    textAlign: 'center' as const,
  },
  durationSection: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  durationLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  durationInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  durationInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  durationInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600' as const,
    paddingVertical: 12,
  },
  durationUnit: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  estimateText: {
    fontSize: 13,
  },
  logButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  logButtonDisabled: {
    opacity: 0.4,
  },
  logButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  fullWidth: {
    width: '100%',
  },
  describeCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  describeInput: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 15,
    minHeight: 100,
    lineHeight: 22,
  },
  describeButton: {
    backgroundColor: '#6C63FF',
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  manualCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 14,
  },
  manualField: {
    gap: 6,
  },
  manualFieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  fieldInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  stepsCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    gap: 20,
  },
  stepsDisplay: {
    alignItems: 'center',
    gap: 6,
  },
  stepsCount: {
    fontSize: 36,
    fontWeight: '800' as const,
  },
  stepsLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  stepsCal: {
    fontSize: 13,
  },
  healthConnectSection: {
    borderTopWidth: 1,
    paddingTop: 16,
    gap: 10,
  },
  healthConnectTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  healthConnectDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  healthConnectWarning: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  healthConnectBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginTop: 4,
  },
  healthConnectBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  historySection: {
    marginTop: 24,
    gap: 10,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  historyItemInfo: {
    flex: 1,
    gap: 2,
  },
  historyItemName: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  historyItemDetails: {
    fontSize: 13,
  },
});
