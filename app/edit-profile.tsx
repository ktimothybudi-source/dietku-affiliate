import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useNutrition } from '@/contexts/NutritionContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { UserProfile } from '@/types/nutrition';
import * as Haptics from 'expo-haptics';

export default function EditProfileScreen() {
  const { profile, saveProfile, isSaving } = useNutrition();
  const { theme } = useTheme();
  const { l } = useLanguage();

  const [name, setName] = useState(profile?.name || '');
  const [age, setAge] = useState(profile?.age.toString() || '');
  const [sex, setSex] = useState<'male' | 'female'>(profile?.sex || 'male');
  const [height, setHeight] = useState(profile?.height.toString() || '');
  const [weight, setWeight] = useState(profile?.weight.toString() || '');
  const [goalWeight, setGoalWeight] = useState(profile?.goalWeight?.toString() || profile?.weight.toString() || '');
  const [goal, setGoal] = useState<'fat_loss' | 'maintenance' | 'muscle_gain'>(profile?.goal || 'maintenance');
  const [activityLevel, setActivityLevel] = useState<'low' | 'moderate' | 'high'>(profile?.activityLevel || 'moderate');
  const [weeklyWeightChange, setWeeklyWeightChange] = useState(profile?.weeklyWeightChange?.toString() || '');

  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    const changed = 
      name !== (profile?.name || '') ||
      age !== profile?.age.toString() ||
      sex !== profile?.sex ||
      height !== profile?.height.toString() ||
      weight !== profile?.weight.toString() ||
      goalWeight !== (profile?.goalWeight?.toString() || profile?.weight.toString()) ||
      goal !== profile?.goal ||
      activityLevel !== profile?.activityLevel ||
      weeklyWeightChange !== (profile?.weeklyWeightChange?.toString() || '');
    setHasChanges(changed);
  }, [name, age, sex, height, weight, goalWeight, goal, activityLevel, weeklyWeightChange, profile]);

  const handleSave = () => {
    if (!age || !height || !weight || !goalWeight) {
      Alert.alert(l('Error', 'Error'), l('Mohon lengkapi semua field yang wajib diisi', 'Please complete all required fields'));
      return;
    }

    const ageNum = parseInt(age);
    const heightNum = parseInt(height);
    const weightNum = parseFloat(weight);
    const goalWeightNum = parseFloat(goalWeight);
    let weeklyWeightChangeNum = weeklyWeightChange.trim()
      ? parseFloat(weeklyWeightChange.replace(',', '.'))
      : undefined;

    if (weeklyWeightChange.trim() && (weeklyWeightChangeNum === undefined || Number.isNaN(weeklyWeightChangeNum))) {
      Alert.alert(l('Error', 'Error'), l('Target per minggu harus berupa angka (contoh: 0.5 atau -0.5)', 'Weekly target must be a number (e.g. 0.5 or -0.5)'));
      return;
    }

    if (ageNum < 15 || ageNum > 100) {
      Alert.alert(l('Error', 'Error'), l('Usia harus antara 15-100 tahun', 'Age must be between 15-100 years'));
      return;
    }

    if (heightNum < 100 || heightNum > 250) {
      Alert.alert(l('Error', 'Error'), l('Tinggi harus antara 100-250 cm', 'Height must be between 100-250 cm'));
      return;
    }

    if (weightNum < 30 || weightNum > 300) {
      Alert.alert(l('Error', 'Error'), l('Berat harus antara 30-300 kg', 'Weight must be between 30-300 kg'));
      return;
    }

    if (goalWeightNum < 30 || goalWeightNum > 300) {
      Alert.alert(l('Error', 'Error'), l('Target berat harus antara 30-300 kg', 'Goal weight must be between 30-300 kg'));
      return;
    }

    if (goal === 'muscle_gain' && goalWeightNum < weightNum) {
      Alert.alert('Perhatian', l('Untuk tujuan membangun otot, target berat tidak boleh lebih rendah dari berat saat ini.', 'For muscle gain, goal weight cannot be lower than current weight.'));
      return;
    }

    if (goal === 'fat_loss' && goalWeightNum > weightNum) {
      Alert.alert('Perhatian', l('Untuk tujuan menurunkan berat badan, target berat tidak boleh lebih tinggi dari berat saat ini.', 'For fat loss, goal weight cannot be higher than current weight.'));
      return;
    }

    if (weeklyWeightChangeNum !== undefined) {
      const absValue = Math.abs(weeklyWeightChangeNum);
      const maxWeekly = goal === 'muscle_gain' ? 0.5 : 1.0;
      if (absValue > maxWeekly || (absValue > 0 && absValue < 0.1)) {
        const rangeHint =
          goal === 'muscle_gain'
            ? 'Untuk naik berat: 0.1–0.5 kg per minggu (lebih realistis untuk otot).'
            : 'Untuk turun / pemeliharaan: 0.1–1 kg per minggu.';
        Alert.alert(l('Error', 'Error'), l(`Target per minggu tidak valid. ${rangeHint} Kosongkan untuk pakai default.`, `Invalid weekly target. ${rangeHint} Leave empty to use default.`));
        return;
      }
      weeklyWeightChangeNum = absValue;
    }

    console.log('Saving profile with:', {
      weight: weightNum,
      goalWeight: goalWeightNum,
      goal,
      weeklyWeightChange: weeklyWeightChangeNum,
      activityLevel,
    });

    const updatedProfile: UserProfile = {
      name: name.trim() || undefined,
      age: ageNum,
      sex,
      height: heightNum,
      weight: weightNum,
      goalWeight: goalWeightNum,
      goal,
      activityLevel,
      weeklyWeightChange: weeklyWeightChangeNum,
    };

    saveProfile(updatedProfile);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(l('Berhasil', 'Success'), l('Profil dan target kalori berhasil diperbarui', 'Profile and calorie targets updated successfully'), [
      { text: 'OK', onPress: () => router.back() }
    ]);
  };

  const handleCancel = () => {
    if (hasChanges) {
      Alert.alert(
        l('Batalkan Perubahan', 'Discard Changes'),
        l('Perubahan yang Anda buat belum disimpan. Apakah Anda yakin ingin keluar?', 'Your changes are not saved yet. Are you sure you want to leave?'),
        [
          { text: l('Lanjutkan Edit', 'Continue Editing'), style: 'cancel' },
          { text: l('Batalkan', 'Discard'), style: 'destructive', onPress: () => router.back() },
        ]
      );
    } else {
      router.back();
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: l('Edit Profil', 'Edit Profile'),
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          headerLeft: () => (
            <TouchableOpacity onPress={handleCancel} style={styles.headerButton}>
              <Text style={[styles.headerButtonText, { color: theme.text }]}>{l('Batal', 'Cancel')}</Text>
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity 
              onPress={handleSave} 
              style={styles.headerButton}
              disabled={!hasChanges || isSaving}
            >
              <Text style={[
                styles.headerButtonText, 
                { color: hasChanges ? theme.primary : theme.textSecondary }
              ]}>
                {isSaving ? l('Menyimpan...', 'Saving...') : l('Simpan', 'Save')}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView 
        style={[styles.container, { backgroundColor: theme.background }]} 
        contentContainerStyle={styles.content}
      >
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{l('Info Dasar', 'Basic Info')}</Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>{l('Nama', 'Name')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              value={name}
              onChangeText={setName}
              placeholder={l('Nama Anda', 'Your name')}
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>{l('Usia (tahun)', 'Age (years)')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              value={age}
              onChangeText={setAge}
              keyboardType="number-pad"
              placeholder="25"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>{l('Jenis Kelamin', 'Sex')}</Text>
            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[
                  styles.option,
                  { borderColor: theme.border },
                  sex === 'male' && { backgroundColor: theme.primary, borderColor: theme.primary }
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSex('male');
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.optionText,
                  { color: theme.text },
                  sex === 'male' && { color: '#FFFFFF' }
                ]}>Pria</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.option,
                  { borderColor: theme.border },
                  sex === 'female' && { backgroundColor: theme.primary, borderColor: theme.primary }
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSex('female');
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.optionText,
                  { color: theme.text },
                  sex === 'female' && { color: '#FFFFFF' }
                ]}>Wanita</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>Tinggi (cm)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              value={height}
              onChangeText={setHeight}
              keyboardType="number-pad"
              placeholder="170"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>Berat (kg)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
              placeholder="70"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>Target Berat (kg)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              value={goalWeight}
              onChangeText={setGoalWeight}
              keyboardType="decimal-pad"
              placeholder="65"
              placeholderTextColor={theme.textSecondary}
            />
          </View>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>Target Per Minggu (kg)</Text>
            <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>
              {goal === 'muscle_gain'
                ? 'Disarankan naik 0.2–0.5 kg/minggu (naik otot realistis).'
                : 'Disarankan turun 0.2–1 kg/minggu. Boleh angka negatif di kolom (contoh: -0.5).'}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              value={weeklyWeightChange}
              onChangeText={setWeeklyWeightChange}
              keyboardType="numeric"
              placeholder="-0.5"
              placeholderTextColor={theme.textSecondary}
            />
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Tujuan</Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>Tujuan Fitness</Text>
            <View style={styles.goalOptions}>
              <TouchableOpacity
                style={[
                  styles.goalOption,
                  { borderColor: theme.border },
                  goal === 'fat_loss' && { backgroundColor: theme.primary, borderColor: theme.primary }
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setGoal('fat_loss');
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.goalOptionTitle,
                  { color: theme.text },
                  goal === 'fat_loss' && { color: '#FFFFFF' }
                ]}>Kurangi Lemak</Text>
                <Text style={[
                  styles.goalOptionDesc,
                  { color: theme.textSecondary },
                  goal === 'fat_loss' && { color: 'rgba(255, 255, 255, 0.8)' }
                ]}>Defisit kalori</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.goalOption,
                  { borderColor: theme.border },
                  goal === 'maintenance' && { backgroundColor: theme.primary, borderColor: theme.primary }
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setGoal('maintenance');
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.goalOptionTitle,
                  { color: theme.text },
                  goal === 'maintenance' && { color: '#FFFFFF' }
                ]}>Pertahankan Berat</Text>
                <Text style={[
                  styles.goalOptionDesc,
                  { color: theme.textSecondary },
                  goal === 'maintenance' && { color: 'rgba(255, 255, 255, 0.8)' }
                ]}>Kalori seimbang</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.goalOption,
                  { borderColor: theme.border },
                  goal === 'muscle_gain' && { backgroundColor: theme.primary, borderColor: theme.primary }
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setGoal('muscle_gain');
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.goalOptionTitle,
                  { color: theme.text },
                  goal === 'muscle_gain' && { color: '#FFFFFF' }
                ]}>Bangun Otot</Text>
                <Text style={[
                  styles.goalOptionDesc,
                  { color: theme.textSecondary },
                  goal === 'muscle_gain' && { color: 'rgba(255, 255, 255, 0.8)' }
                ]}>Surplus kalori</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Tingkat Aktivitas</Text>

          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.text }]}>Aktivitas Harian</Text>
            <View style={styles.goalOptions}>
              <TouchableOpacity
                style={[
                  styles.goalOption,
                  { borderColor: theme.border },
                  activityLevel === 'low' && { backgroundColor: theme.primary, borderColor: theme.primary }
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActivityLevel('low');
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.goalOptionTitle,
                  { color: theme.text },
                  activityLevel === 'low' && { color: '#FFFFFF' }
                ]}>Rendah</Text>
                <Text style={[
                  styles.goalOptionDesc,
                  { color: theme.textSecondary },
                  activityLevel === 'low' && { color: 'rgba(255, 255, 255, 0.8)' }
                ]}>Duduk/kantor</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.goalOption,
                  { borderColor: theme.border },
                  activityLevel === 'moderate' && { backgroundColor: theme.primary, borderColor: theme.primary }
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActivityLevel('moderate');
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.goalOptionTitle,
                  { color: theme.text },
                  activityLevel === 'moderate' && { color: '#FFFFFF' }
                ]}>Sedang</Text>
                <Text style={[
                  styles.goalOptionDesc,
                  { color: theme.textSecondary },
                  activityLevel === 'moderate' && { color: 'rgba(255, 255, 255, 0.8)' }
                ]}>Olahraga 3-5x/minggu</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.goalOption,
                  { borderColor: theme.border },
                  activityLevel === 'high' && { backgroundColor: theme.primary, borderColor: theme.primary }
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActivityLevel('high');
                }}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.goalOptionTitle,
                  { color: theme.text },
                  activityLevel === 'high' && { color: '#FFFFFF' }
                ]}>Tinggi</Text>
                <Text style={[
                  styles.goalOptionDesc,
                  { color: theme.textSecondary },
                  activityLevel === 'high' && { color: 'rgba(255, 255, 255, 0.8)' }
                ]}>Olahraga intensif</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
  },
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  section: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: '600' as const,
    marginBottom: 10,
  },
  input: {
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  option: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  goalOptions: {
    gap: 12,
  },
  goalOption: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 16,
  },
  goalOptionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 4,
  },
  goalOptionDesc: {
    fontSize: 14,
  },
  bottomPadding: {
    height: 40,
  },
  fieldHint: {
    fontSize: 13,
    marginBottom: 8,
    fontStyle: 'italic' as const,
  },
});
