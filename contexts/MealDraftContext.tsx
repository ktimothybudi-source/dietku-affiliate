import createContextHook from '@nkzw/create-context-hook';
import { useCallback, useMemo, useState } from 'react';
import type { FoodSearchResult } from '@/types/food';

export type MealDraftLine = {
  localId: string;
  foodId: number;
  name: string;
  grams: number;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  image?: string | null;
};

function mid(a: number, b: number): number {
  return (a + b) / 2;
}

function per100FromSearchResult(food: FoodSearchResult): Pick<
  MealDraftLine,
  'caloriesPer100g' | 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g'
> {
  const s =
    food.servingSizeG && Number(food.servingSizeG) > 0 ? Number(food.servingSizeG) : 100;
  const scale = 100 / s;
  return {
    caloriesPer100g: mid(food.caloriesMin, food.caloriesMax) * scale,
    proteinPer100g: mid(food.proteinMin, food.proteinMax) * scale,
    carbsPer100g: mid(food.carbsMin, food.carbsMax) * scale,
    fatPer100g: mid(food.fatMin, food.fatMax) * scale,
  };
}

export function lineTotals(line: MealDraftLine) {
  const m = line.grams / 100;
  return {
    calories: Number((line.caloriesPer100g * m).toFixed(2)),
    protein: Number((line.proteinPer100g * m).toFixed(2)),
    carbs: Number((line.carbsPer100g * m).toFixed(2)),
    fat: Number((line.fatPer100g * m).toFixed(2)),
  };
}

export const [MealDraftProvider, useMealDraft] = createContextHook(() => {
  const [sessionActive, setSessionActive] = useState(false);
  const [lines, setLines] = useState<MealDraftLine[]>([]);

  const startNewMeal = useCallback(() => {
    setLines([]);
    setSessionActive(true);
  }, []);

  const endSession = useCallback(() => {
    setSessionActive(false);
    setLines([]);
  }, []);

  const addFromSearchResult = useCallback((food: FoodSearchResult) => {
    const p = per100FromSearchResult(food);
    const localId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setLines((prev) => [
      ...prev,
      {
        localId,
        foodId: food.id,
        name: food.name,
        grams: 100,
        ...p,
        image: food.image,
      },
    ]);
  }, []);

  const updateLineGrams = useCallback((localId: string, grams: number) => {
    const g = Number.isFinite(grams) && grams > 0 ? grams : 0;
    setLines((prev) => prev.map((l) => (l.localId === localId ? { ...l, grams: g } : l)));
  }, []);

  const removeLine = useCallback((localId: string) => {
    setLines((prev) => prev.filter((l) => l.localId !== localId));
  }, []);

  const mealTotals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        if (line.grams <= 0) return acc;
        const t = lineTotals(line);
        return {
          calories: acc.calories + t.calories,
          protein: acc.protein + t.protein,
          carbs: acc.carbs + t.carbs,
          fat: acc.fat + t.fat,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [lines]);

  return {
    sessionActive,
    setSessionActive,
    lines,
    startNewMeal,
    endSession,
    addFromSearchResult,
    updateLineGrams,
    removeLine,
    mealTotals,
  };
});
