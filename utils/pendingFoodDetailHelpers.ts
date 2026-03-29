import type { PendingFoodEntry } from '@/contexts/NutritionContext';
import type { FoodEntry, MealAnalysis } from '@/types/nutrition';

export type EditedFoodItem = {
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
  fiber?: number;
  sodium?: number;
};

export function mapAnalysisToEditedItems(analysis: MealAnalysis): EditedFoodItem[] {
  return analysis.items.map(item => ({
    name: item.name,
    portion: item.portion,
    calories: Math.round((item.caloriesMin + item.caloriesMax) / 2),
    protein: Math.round((item.proteinMin + item.proteinMax) / 2),
    carbs: Math.round((item.carbsMin + item.carbsMax) / 2),
    fat: Math.round((item.fatMin + item.fatMax) / 2),
    sugar: Math.round((((item.sugarMin ?? 0) + (item.sugarMax ?? 0)) / 2) * 10) / 10,
    fiber: Math.round((((item.fiberMin ?? 0) + (item.fiberMax ?? 0)) / 2) * 10) / 10,
    sodium: Math.round(((item.sodiumMin ?? 0) + (item.sodiumMax ?? 0)) / 2),
  }));
}

export function foodEntryToViewPending(entry: FoodEntry): PendingFoodEntry {
  const items = entry.name.split(',').map((name, index) => {
    const itemCount = entry.name.split(',').length;
    return {
      name: name.trim(),
      portion: '1 porsi',
      calories: Math.round(entry.calories / itemCount),
      protein: Math.round(entry.protein / itemCount),
      carbs: Math.round(entry.carbs / itemCount),
      fat: Math.round(entry.fat / itemCount),
      sugar: 0,
      fiber: 0,
      sodium: 0,
    };
  });

  return {
    id: `view-${entry.id}`,
    photoUri: entry.photoUri || '',
    base64: '',
    timestamp: entry.timestamp,
    status: 'done',
    analysis: {
      items: items.map(item => ({
        name: item.name,
        portion: item.portion,
        caloriesMin: item.calories,
        caloriesMax: item.calories,
        proteinMin: item.protein,
        proteinMax: item.protein,
        carbsMin: item.carbs,
        carbsMax: item.carbs,
        fatMin: item.fat,
        fatMax: item.fat,
        sugarMin: item.sugar ?? 0,
        sugarMax: item.sugar ?? 0,
        fiberMin: item.fiber ?? 0,
        fiberMax: item.fiber ?? 0,
        sodiumMin: item.sodium ?? 0,
        sodiumMax: item.sodium ?? 0,
      })),
      totalCaloriesMin: entry.calories,
      totalCaloriesMax: entry.calories,
      totalProteinMin: entry.protein,
      totalProteinMax: entry.protein,
      confidence: 'high',
    },
  };
}
