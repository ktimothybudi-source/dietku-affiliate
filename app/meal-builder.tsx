import React, { useEffect } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { ChevronLeft, Plus, Search, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useNutrition } from '@/contexts/NutritionContext';
import { useMealDraft, lineTotals } from '@/contexts/MealDraftContext';
import { getDefaultMealNameAndType } from '@/lib/mealDefaults';

export default function MealBuilderScreen() {
  const { theme } = useTheme();
  const { l } = useLanguage();
  const insets = useSafeAreaInsets();
  const { addComposedMeal, isSaving } = useNutrition();
  const { startNewMeal, endSession, lines, updateLineGrams, removeLine, mealTotals, setSessionActive } =
    useMealDraft();

  useEffect(() => {
    setSessionActive(true);
    startNewMeal();
  }, [startNewMeal, setSessionActive]);

  const openSearch = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/food-search');
  };

  const onSave = () => {
    if (lines.length === 0) {
      Alert.alert(l('Kosong', 'Empty'), l('Tambah minimal satu makanan.', 'Add at least one food item.'));
      return;
    }
    if (lines.some((l) => l.grams <= 0)) {
      Alert.alert(l('Gram', 'Grams'), l('Semua item harus punya gram lebih dari 0.', 'All items must have grams greater than 0.'));
      return;
    }
    const { displayName, mealType } = getDefaultMealNameAndType();
    const payloadLines = lines.map((l) => {
      const t = lineTotals(l);
      return {
        foodId: l.foodId,
        foodName: l.name,
        grams: l.grams,
        calories: t.calories,
        protein: t.protein,
        carbs: t.carbs,
        fat: t.fat,
      };
    });

    addComposedMeal(
      {
        displayName,
        mealType,
        lines: payloadLines,
      },
      true
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    endSession();
    router.back();
  };

  const onBack = () => {
    if (lines.length > 0) {
      Alert.alert(l('Buang draft?', 'Discard draft?'), l('Makanan di keranjang akan hilang.', 'Food in the cart will be lost.'), [
        { text: l('Batal', 'Cancel'), style: 'cancel' },
        {
          text: l('Buang', 'Discard'),
          style: 'destructive',
          onPress: () => {
            endSession();
            router.back();
          },
        },
      ]);
      return;
    }
    endSession();
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: theme.card }]} onPress={onBack}>
            <ChevronLeft size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>Susun Makanan</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            style={[styles.searchBtn, { backgroundColor: theme.primary }]}
            onPress={openSearch}
            activeOpacity={0.9}
          >
            <Search size={20} color="#FFFFFF" />
            <Text style={styles.searchBtnText}>Cari & tambah makanan</Text>
          </TouchableOpacity>

          <Text style={[styles.section, { color: theme.text }]}>Komponen makanan</Text>
          {lines.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textTertiary }]}>Belum ada item. Tap cari di atas.</Text>
          ) : (
            lines.map((line) => {
              const t = lineTotals(line);
              return (
                <View key={line.localId} style={[styles.lineCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.lineTopRow}>
                    <Text style={[styles.lineName, { color: theme.text }]} numberOfLines={2}>
                      {line.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        removeLine(line.localId);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      }}
                      hitSlop={12}
                    >
                      <Trash2 size={18} color={theme.textTertiary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.lineSub, { color: theme.textSecondary }]}>
                    {Math.round(t.calories)} kcal · P{t.protein} C{t.carbs} L{t.fat}
                  </Text>
                  <Text style={[styles.gramLabel, { color: theme.textTertiary }]}>Gram</Text>
                  <TextInput
                    style={[styles.gramInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                    keyboardType="decimal-pad"
                    value={line.grams === 0 ? '' : String(line.grams)}
                    onChangeText={(txt) => {
                      const n = parseFloat(txt.replace(',', '.'));
                      updateLineGrams(line.localId, Number.isFinite(n) ? n : 0);
                    }}
                  />
                </View>
              );
            })
          )}

          <View style={[styles.summary, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.summaryTitle, { color: theme.text }]}>Total makanan</Text>
            <Text style={[styles.summaryLine, { color: theme.textSecondary }]}>
      Kalori: {Math.round(mealTotals.calories)} kcal
            </Text>
            <Text style={[styles.summaryLine, { color: theme.textSecondary }]}>
              Protein: {Math.round(mealTotals.protein)}g · Karbo: {Math.round(mealTotals.carbs)}g · Lemak:{' '}
              {Math.round(mealTotals.fat)}g
            </Text>
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderTopColor: theme.border, backgroundColor: theme.background }]}>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: isSaving ? 0.7 : 1 }]}
            onPress={onSave}
            disabled={isSaving || lines.length === 0}
            activeOpacity={0.9}
          >
            <Plus size={22} color="#FFFFFF" />
            <Text style={styles.saveBtnText}>Simpan makanan</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700' as const },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24, gap: 12 },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  searchBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' as const },
  section: { fontSize: 15, fontWeight: '700' as const, marginTop: 8 },
  empty: { fontSize: 14, paddingVertical: 8 },
  lineCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  lineTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  lineName: { flex: 1, fontSize: 15, fontWeight: '700' as const },
  lineSub: { fontSize: 12 },
  gramLabel: { fontSize: 12, fontWeight: '600' as const, marginTop: 4 },
  gramInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  summary: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    gap: 6,
  },
  summaryTitle: { fontSize: 15, fontWeight: '700' as const },
  summaryLine: { fontSize: 14 },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' as const },
});
