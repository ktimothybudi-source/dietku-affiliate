import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Drumstick, Droplets, Flame, Wheat } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useNutrition } from '@/contexts/NutritionContext';
import { supabase } from '@/lib/supabase';

/** Set `true` to show satuan (tbsp, egg, …); manual gram field is always used when `false`. */
const SHOW_FOOD_SERVINGS_UI = false;

type ManualFoodPer100g = {
  id: number;
  name: string;
  energy_kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  image?: string | null;
};

type FoodServingRow = {
  id: number;
  serving_name: string;
  grams: number;
};

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function calculateFromGramsPer100g(food: ManualFoodPer100g, grams: number) {
  const safeGrams = Number.isFinite(grams) && grams > 0 ? grams : 0;
  const multiplier = safeGrams / 100;
  return {
    grams: safeGrams,
    calories: Number((food.energy_kcal * multiplier).toFixed(2)),
    protein: Number((food.protein_g * multiplier).toFixed(2)),
    fat: Number((food.fat_g * multiplier).toFixed(2)),
    carbs: Number((food.carb_g * multiplier).toFixed(2)),
  };
}

function mapFoodsTableRowToPer100g(item: Record<string, unknown>): ManualFoodPer100g | null {
  const id = Number(item.id);
  const name = String(item.name ?? '');
  if (!name) return null;

  const eMin = toNum(item.energy_kcal_min ?? item.energy_kcal ?? item.calories ?? item.calories_min ?? 0);
  const eMax = toNum(
    item.energy_kcal_max ?? item.calories_max ?? item.energy_kcal ?? item.calories ?? eMin
  );
  const pMin = toNum(item.protein_g_min ?? item.protein_g ?? item.proteins ?? item.protein ?? 0);
  const pMax = toNum(item.protein_g_max ?? item.protein_g ?? item.proteins ?? item.protein ?? pMin);
  const fMin = toNum(item.fat_g_min ?? item.fat_g ?? item.fat ?? 0);
  const fMax = toNum(item.fat_g_max ?? item.fat_g ?? item.fat ?? fMin);
  const cMin = toNum(item.carb_g_min ?? item.carb_g ?? item.carbohydrate ?? item.carbs ?? 0);
  const cMax = toNum(item.carb_g_max ?? item.carb_g ?? item.carbohydrate ?? item.carbs ?? cMin);

  return {
    id,
    name,
    energy_kcal: (eMin + eMax) / 2,
    protein_g: (pMin + pMax) / 2,
    fat_g: (fMin + fMax) / 2,
    carb_g: (cMin + cMax) / 2,
    image: (item.image ?? null) as string | null,
  };
}

async function fetchFoodPer100g(foodId: number): Promise<ManualFoodPer100g | null> {
  const fromFood = await supabase
    .from('food')
    .select('id,name,calories,proteins,fat,carbohydrate,image')
    .eq('id', foodId)
    .maybeSingle();

  if (!fromFood.error && fromFood.data) {
    return {
      id: Number(fromFood.data.id),
      name: String(fromFood.data.name ?? ''),
      energy_kcal: toNum(fromFood.data.calories),
      protein_g: toNum(fromFood.data.proteins),
      fat_g: toNum(fromFood.data.fat),
      carb_g: toNum(fromFood.data.carbohydrate),
      image: fromFood.data.image,
    };
  }

  const fromFoods = await supabase.from('foods').select('*').eq('id', foodId).maybeSingle();

  if (fromFoods.error || !fromFoods.data) {
    return null;
  }

  return mapFoodsTableRowToPer100g(fromFoods.data as Record<string, unknown>);
}

function sortServingsRows(rows: FoodServingRow[]): FoodServingRow[] {
  return [...rows].sort((a, b) => {
    if (a.serving_name === '100 g') return -1;
    if (b.serving_name === '100 g') return 1;
    return a.serving_name.localeCompare(b.serving_name, 'id');
  });
}

async function fetchFoodServings(foodId: number): Promise<FoodServingRow[]> {
  const { data, error } = await supabase
    .from('food_servings')
    .select('id,serving_name,grams')
    .eq('food_id', foodId);

  if (error) {
    console.warn('[manual-food-detail] food_servings:', error.message);
    return [];
  }

  const rows = (data ?? []).map((r: { id: unknown; serving_name: unknown; grams: unknown }) => ({
    id: Number(r.id),
    serving_name: String(r.serving_name ?? ''),
    grams: toNum(r.grams),
  })).filter((r) => r.serving_name.length > 0 && r.grams > 0 && Number.isFinite(r.id));

  return sortServingsRows(rows);
}

export default function ManualFoodDetailScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { addFoodEntry } = useNutrition();
  const params = useLocalSearchParams<{ foodId?: string | string[] }>();
  const rawFoodId = params.foodId;
  const foodIdStr = Array.isArray(rawFoodId) ? rawFoodId[0] : rawFoodId;
  const foodId =
    foodIdStr != null && String(foodIdStr).trim() !== '' ? Number(foodIdStr) : NaN;
  const [gramsText, setGramsText] = useState('100');
  const [servingQtyText, setServingQtyText] = useState('1');
  const [inputMode, setInputMode] = useState<'serving' | 'grams'>('grams');
  const [selectedServingId, setSelectedServingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const servingsInitForFoodIdRef = useRef<number | null>(null);

  const foodQuery = useQuery({
    queryKey: ['manual_food_per_100g', foodId],
    enabled: Number.isFinite(foodId) && foodId >= 0,
    queryFn: async () => fetchFoodPer100g(foodId),
  });

  const servingsQuery = useQuery({
    queryKey: ['food_servings', foodId],
    enabled: SHOW_FOOD_SERVINGS_UI && Number.isFinite(foodId) && foodId >= 0,
    queryFn: async () => fetchFoodServings(foodId),
  });

  const servings = SHOW_FOOD_SERVINGS_UI ? (servingsQuery.data ?? []) : [];

  useEffect(() => {
    setGramsText('100');
    setServingQtyText('1');
    servingsInitForFoodIdRef.current = null;
  }, [foodId]);

  useEffect(() => {
    if (!SHOW_FOOD_SERVINGS_UI) return;
    if (!Number.isFinite(foodId) || foodId <= 0) return;
    if (!servingsQuery.isSuccess) return;

    const rows = servingsQuery.data;
    if (!rows || rows.length === 0) {
      setInputMode('grams');
      setSelectedServingId(null);
      return;
    }

    if (servingsInitForFoodIdRef.current === foodId) return;
    servingsInitForFoodIdRef.current = foodId;

    const preferred = rows.find((s) => s.serving_name === '100 g') ?? rows[0];
    setSelectedServingId(preferred.id);
    setInputMode('serving');
  }, [foodId, servingsQuery.isSuccess, servingsQuery.data]);

  const selectedServing = useMemo(
    () => (selectedServingId == null ? null : servings.find((s) => s.id === selectedServingId) ?? null),
    [servings, selectedServingId]
  );

  const servingQty = useMemo(() => {
    const normalized = servingQtyText.replace(',', '.');
    const n = parseFloat(normalized);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [servingQtyText]);

  const gramsFromGramsInput = useMemo(() => {
    const normalized = gramsText.replace(',', '.');
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : 0;
  }, [gramsText]);

  const grams = useMemo(() => {
    if (
      SHOW_FOOD_SERVINGS_UI &&
      inputMode === 'serving' &&
      selectedServing &&
      servingQty > 0
    ) {
      return Number((servingQty * selectedServing.grams).toFixed(4));
    }
    return gramsFromGramsInput;
  }, [inputMode, selectedServing, servingQty, gramsFromGramsInput]);

  const totals = useMemo(() => {
    if (!foodQuery.data) return null;
    return calculateFromGramsPer100g(foodQuery.data, grams);
  }, [foodQuery.data, grams]);

  const onBack = () => {
    Keyboard.dismiss();
    router.back();
  };

  const onSave = async () => {
    if (!foodQuery.data || !totals) return;
    if (totals.grams <= 0) {
      Alert.alert('Gram tidak valid', 'Masukkan gram lebih dari 0.');
      return;
    }

    setSaving(true);
    try {
      addFoodEntry({
        name: foodQuery.data.name,
        calories: totals.calories,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        photoUri: foodQuery.data.image || undefined,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={[styles.backButton, { backgroundColor: theme.card }]} onPress={onBack} activeOpacity={0.7}>
            <ChevronLeft size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Tambah Manual</Text>
          <View style={{ width: 44 }} />
        </View>

        {foodQuery.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : !foodQuery.data ? (
          <View style={styles.center}>
            <Text style={{ color: theme.textSecondary }}>Makanan tidak ditemukan.</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.foodName, { color: theme.text }]}>{foodQuery.data.name}</Text>

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Nutrisi per 100g</Text>
              <View style={styles.row}>
                <View style={styles.macroItem}>
                  <Flame size={14} color="#EF4444" />
                  <Text style={[styles.macroText, { color: theme.textSecondary }]}>{foodQuery.data.energy_kcal} kcal</Text>
                </View>
                <View style={styles.macroItem}>
                  <Drumstick size={14} color="#6C63FF" />
                  <Text style={[styles.macroText, { color: theme.textSecondary }]}>{foodQuery.data.protein_g}g</Text>
                </View>
                <View style={styles.macroItem}>
                  <Wheat size={14} color="#3B82F6" />
                  <Text style={[styles.macroText, { color: theme.textSecondary }]}>{foodQuery.data.carb_g}g</Text>
                </View>
                <View style={styles.macroItem}>
                  <Droplets size={14} color="#F59E0B" />
                  <Text style={[styles.macroText, { color: theme.textSecondary }]}>{foodQuery.data.fat_g}g</Text>
                </View>
              </View>
            </View>

            {servings.length > 0 && (
              <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Cara makan</Text>
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={[
                      styles.modeChip,
                      { borderColor: theme.border, backgroundColor: theme.background },
                      inputMode === 'serving' && { borderColor: theme.primary, backgroundColor: `${theme.primary}18` },
                    ]}
                    onPress={() => setInputMode('serving')}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.modeChipText, { color: inputMode === 'serving' ? theme.primary : theme.textSecondary }]}>
                      Pakai satuan
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modeChip,
                      { borderColor: theme.border, backgroundColor: theme.background },
                      inputMode === 'grams' && { borderColor: theme.primary, backgroundColor: `${theme.primary}18` },
                    ]}
                    onPress={() => setInputMode('grams')}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.modeChipText, { color: inputMode === 'grams' ? theme.primary : theme.textSecondary }]}>
                      Gram langsung
                    </Text>
                  </TouchableOpacity>
                </View>

                {inputMode === 'serving' ? (
                  <>
                    <Text style={[styles.hint, { color: theme.textTertiary }]}>Pilih satuan</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {servings.map((s) => {
                        const on = s.id === selectedServingId;
                        return (
                          <TouchableOpacity
                            key={s.id}
                            style={[
                              styles.unitChip,
                              { borderColor: theme.border, backgroundColor: theme.background },
                              on && { borderColor: theme.primary, backgroundColor: `${theme.primary}22` },
                            ]}
                            onPress={() => {
                              setSelectedServingId(s.id);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.unitChipText, { color: on ? theme.primary : theme.text }]} numberOfLines={2}>
                              {s.serving_name}
                            </Text>
                            <Text style={[styles.unitChipSub, { color: theme.textTertiary }]}>{s.grams} g</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <Text style={[styles.hint, { color: theme.textTertiary, marginTop: 10 }]}>Jumlah</Text>
                    <TextInput
                      style={[styles.gramInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                      value={servingQtyText}
                      onChangeText={setServingQtyText}
                      keyboardType="decimal-pad"
                      placeholder="1"
                      placeholderTextColor={theme.textTertiary}
                    />
                    {selectedServing ? (
                      <Text style={[styles.derivedGrams, { color: theme.textSecondary }]}>
                        ≈ {grams.toFixed(grams >= 10 ? 0 : 1)} g total
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </View>
            )}

            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                {servings.length > 0 && inputMode === 'serving' ? 'Atau gram manual' : 'Masukkan gram'}
              </Text>
              {(servings.length === 0 || inputMode === 'grams') ? (
              <TextInput
                style={[styles.gramInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                value={gramsText}
                onChangeText={(t) => {
                  setGramsText(t);
                  if (servings.length > 0) setInputMode('grams');
                }}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor={theme.textTertiary}
                editable={servings.length === 0 || inputMode === 'grams'}
              />
              ) : (
                <Text style={[styles.gramReadonly, { color: theme.textSecondary }]}>
                  Pakai tab "Gram langsung" atau ubah jumlah satuan di atas.
                </Text>
              )}

              {totals ? (
                <View style={{ marginTop: 14 }}>
                  <Text style={[styles.previewTitle, { color: theme.text }]}>Preview total</Text>
                  <Text style={[styles.previewLine, { color: theme.textSecondary }]}>Kalori: {totals.calories} kcal</Text>
                  <Text style={[styles.previewLine, { color: theme.textSecondary }]}>Protein: {totals.protein}g</Text>
                  <Text style={[styles.previewLine, { color: theme.textSecondary }]}>Karbo: {totals.carbs}g</Text>
                  <Text style={[styles.previewLine, { color: theme.textSecondary }]}>Lemak: {totals.fat}g</Text>
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }]}
              onPress={onSave}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveText}>Tambah ke Log</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700' as const },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, gap: 12, paddingBottom: 28 },
  foodName: { fontSize: 24, fontWeight: '800' as const },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' as const, marginBottom: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  macroItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  macroText: { fontSize: 13, fontWeight: '600' as const },
  gramInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  modeChipText: { fontSize: 13, fontWeight: '700' as const },
  hint: { fontSize: 12, fontWeight: '600' as const, marginBottom: 8 },
  chipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  unitChip: {
    maxWidth: 140,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  unitChipText: { fontSize: 13, fontWeight: '700' as const },
  unitChipSub: { fontSize: 11, fontWeight: '600' as const, marginTop: 4 },
  derivedGrams: { marginTop: 8, fontSize: 13, fontWeight: '600' as const },
  gramReadonly: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  previewTitle: { fontSize: 14, fontWeight: '700' as const, marginBottom: 8 },
  previewLine: { fontSize: 13, lineHeight: 20 },
  saveButton: {
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: '#FFFFFF', fontWeight: '800' as const, fontSize: 16 },
});
