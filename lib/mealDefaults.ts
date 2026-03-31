/** Stored on `logged_meals.meal_type` and `food_entries.meal_type` (when column allows). */
export type DbMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'late_snack';

/** Local Bahasa labels + DB meal_type from device local hour. */
export function getDefaultMealNameAndType(): { displayName: string; mealType: DbMealType } {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return { displayName: 'Sarapan', mealType: 'breakfast' };
  if (h >= 11 && h < 15) return { displayName: 'Makan Siang', mealType: 'lunch' };
  if (h >= 15 && h < 21) return { displayName: 'Makan Malam', mealType: 'dinner' };
  if (h >= 21 || h < 1) return { displayName: 'Camilan Malam', mealType: 'late_snack' };
  return { displayName: 'Camilan', mealType: 'snack' };
}
