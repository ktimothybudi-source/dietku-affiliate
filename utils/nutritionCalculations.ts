import { UserProfile, DailyTargets, ActivityLevel, Sex, FoodItemEstimate, MealAnalysis } from '@/types/nutrition';

export function calculateBMR(weight: number, height: number, age: number, sex: Sex): number {
  if (sex === 'male') {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
}

/**
 * Physical activity level (PAL) applied to BMR for TDEE (Mifflin–St Jeor style).
 * Three app buckets map to standard tiers so consecutive steps are similar (~12–15%),
 * not a large jump from sedentary straight to “moderate exercise”.
 */
export function getActivityMultiplier(activityLevel: ActivityLevel): number {
  switch (activityLevel) {
    case 'low':
      return 1.2; // sedentary (little/no exercise)
    case 'moderate':
      return 1.375; // lightly active
    case 'high':
      return 1.55; // moderately active
  }
}

export function calculateTDEE(weight: number, height: number, age: number, sex: Sex, activityLevel: ActivityLevel): number {
  const bmr = calculateBMR(weight, height, age, sex);
  return Math.round(bmr * getActivityMultiplier(activityLevel));
}

export function calculateCalorieAdjustment(profile: UserProfile): number {
  const { weight, goalWeight, goal, weeklyWeightChange } = profile;
  
  if (weeklyWeightChange !== undefined && weeklyWeightChange !== 0) {
    const caloriesPerKg = 7700;
    const dailyAdjustment = (weeklyWeightChange * caloriesPerKg) / 7;
    
    if (goal === 'fat_loss') {
      return -Math.abs(Math.round(dailyAdjustment));
    } else if (goal === 'muscle_gain') {
      return Math.abs(Math.round(dailyAdjustment));
    }
    return 0;
  }
  
  if (goalWeight && goalWeight !== weight) {
    if (goal === 'fat_loss' || goalWeight < weight) {
      return -500;
    } else if (goal === 'muscle_gain' || goalWeight > weight) {
      return 300;
    }
  }
  
  switch (goal) {
    case 'fat_loss':
      return -500;
    case 'muscle_gain':
      return 300;
    case 'maintenance':
    default:
      return 0;
  }
}

export function calculateDailyTargets(profile: UserProfile): DailyTargets {
  const { weight, height, age, sex, activityLevel } = profile;
  
  const tdee = calculateTDEE(weight, height, age, sex, activityLevel);
  const calorieAdjustment = calculateCalorieAdjustment(profile);
  const targetCalories = Math.max(1200, tdee + calorieAdjustment);
  
  console.log('Calorie calculation:', {
    weight,
    height,
    age,
    sex,
    activityLevel,
    bmr: calculateBMR(weight, height, age, sex),
    tdee,
    calorieAdjustment,
    targetCalories,
    goal: profile.goal,
    weeklyWeightChange: profile.weeklyWeightChange,
  });
  
  const proteinGrams = Math.round(weight * 2);
  const proteinCalories = proteinGrams * 4;
  
  const fatPercentage = 0.25;
  const fatCalories = targetCalories * fatPercentage;
  const fatGrams = Math.round(fatCalories / 9);
  
  const remainingCalories = targetCalories - proteinCalories - fatCalories;
  const carbGrams = Math.round(remainingCalories / 4);
  
  const fatMin = Math.round(fatGrams * 0.85);
  const fatMax = Math.round(fatGrams * 1.15);
  const carbsMin = Math.round(carbGrams * 0.85);
  const carbsMax = Math.round(carbGrams * 1.15);
  
  return {
    calories: targetCalories,
    protein: proteinGrams,
    carbsMin,
    carbsMax,
    fatMin,
    fatMax,
  };
}

export function calculateSugarTargetFromCalories(calories: number): number {
  // WHO-style upper limit: <=10% of total calories from added/free sugar.
  return Math.round((Math.max(0, calories) * 0.1) / 4);
}

export function calculateFiberTargetFromCalories(calories: number): number {
  // Common nutrition rule: ~14g fiber per 1000 kcal intake.
  return Math.round((Math.max(0, calories) / 1000) * 14);
}

export function calculateSodiumTargetMg(): number {
  return 2300;
}

/**
 * When the model returns all-zero sugar/fiber/sodium (common if the prompt is ignored), derive rough
 * min/max ranges from calories and carbs so Gula/Serat/Natrium are usable. Skips if any micro is non-zero.
 */
function enrichItemMicrosIfAllZero(item: FoodItemEstimate): FoodItemEstimate {
  const sMin = item.sugarMin ?? 0;
  const sMax = item.sugarMax ?? 0;
  const fMin = item.fiberMin ?? 0;
  const fMax = item.fiberMax ?? 0;
  const naMin = item.sodiumMin ?? 0;
  const naMax = item.sodiumMax ?? 0;
  const allSugarZero = sMin === 0 && sMax === 0;
  const allFiberZero = fMin === 0 && fMax === 0;
  const allSodiumZero = naMin === 0 && naMax === 0;
  if (!allSugarZero || !allFiberZero || !allSodiumZero) {
    return item;
  }
  const calMid = (item.caloriesMin + item.caloriesMax) / 2;
  const carbMid = (item.carbsMin + item.carbsMax) / 2;
  if (calMid < 12) {
    return item;
  }

  const sugarMid =
    carbMid > 1 ? Math.min(Math.max(0.3, carbMid * 0.22), Math.max(carbMid * 0.5, 0.5)) : 0.2;
  const fiberMid = Math.max(0.3, (calMid / 1000) * 14 * 1.15);
  const naMid = Math.max(100, calMid * 1.35);

  return {
    ...item,
    sugarMin: Math.round(sugarMid * 0.5 * 10) / 10,
    sugarMax: Math.round(sugarMid * 1.85 * 10) / 10,
    fiberMin: Math.round(fiberMid * 0.5 * 10) / 10,
    fiberMax: Math.round(fiberMid * 1.9 * 10) / 10,
    sodiumMin: Math.round(naMid * 0.55),
    sodiumMax: Math.round(naMid * 1.8),
  };
}

export function enrichMealAnalysisMicros(analysis: MealAnalysis): MealAnalysis {
  return {
    ...analysis,
    items: analysis.items.map(enrichItemMicrosIfAllZero),
  };
}

/** Sum midpoint of min/max micro ranges per item (e.g. AI meal items). Scale for servings. */
export function sumMidpointMicrosFromItems(
  items: Array<{
    sugarMin?: number;
    sugarMax?: number;
    fiberMin?: number;
    fiberMax?: number;
    sodiumMin?: number;
    sodiumMax?: number;
  }>,
  scale: number = 1
): { sugar: number; fiber: number; sodium: number } {
  const raw = items.reduce(
    (acc, item) => ({
      sugar: acc.sugar + ((item.sugarMin ?? 0) + (item.sugarMax ?? 0)) / 2,
      fiber: acc.fiber + ((item.fiberMin ?? 0) + (item.fiberMax ?? 0)) / 2,
      sodium: acc.sodium + ((item.sodiumMin ?? 0) + (item.sodiumMax ?? 0)) / 2,
    }),
    { sugar: 0, fiber: 0, sodium: 0 }
  );
  const s = Math.max(0, scale);
  return {
    sugar: Math.round(raw.sugar * s * 10) / 10,
    fiber: Math.round(raw.fiber * s * 10) / 10,
    sodium: Math.round(raw.sodium * s),
  };
}

export function calculateWaterTargetCups(weightKg: number): number {
  // Approximation: 35ml per kg bodyweight; 1 cup ~250ml.
  const mlNeeded = Math.max(0, weightKg) * 35;
  return Math.max(4, Math.round(mlNeeded / 250));
}

export function getTodayKey(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export function calculateWeeksToGoal(currentWeight: number, goalWeight: number, weeklyChange: number): number {
  if (weeklyChange === 0 || currentWeight === goalWeight) return 0;
  const weightDiff = Math.abs(goalWeight - currentWeight);
  return Math.ceil(weightDiff / Math.abs(weeklyChange));
}

export function getProjectedGoalDate(currentWeight: number, goalWeight: number, weeklyChange: number): Date | null {
  if (weeklyChange === 0 || currentWeight === goalWeight) return null;
  const weeks = calculateWeeksToGoal(currentWeight, goalWeight, weeklyChange);
  const projectedDate = new Date();
  projectedDate.setDate(projectedDate.getDate() + weeks * 7);
  return projectedDate;
}
