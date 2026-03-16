import { z } from 'zod';
import { MealAnalysis } from '@/types/nutrition';

const foodItemSchema = z.object({
  name: z.string().describe('Name of the food item'),
  portion: z.string().describe('Estimated portion size (e.g., "1 cup", "palm-sized", "150g")'),
  caloriesMin: z.number().describe('Minimum estimated calories'),
  caloriesMax: z.number().describe('Maximum estimated calories'),
  proteinMin: z.number().describe('Minimum estimated protein in grams'),
  proteinMax: z.number().describe('Maximum estimated protein in grams'),
  carbsMin: z.number().describe('Minimum estimated carbs in grams'),
  carbsMax: z.number().describe('Maximum estimated carbs in grams'),
  fatMin: z.number().describe('Minimum estimated fat in grams'),
  fatMax: z.number().describe('Maximum estimated fat in grams'),
  sugarMin: z.number().describe('Minimum estimated sugar in grams'),
  sugarMax: z.number().describe('Maximum estimated sugar in grams'),
  fiberMin: z.number().describe('Minimum estimated dietary fiber in grams'),
  fiberMax: z.number().describe('Maximum estimated dietary fiber in grams'),
  sodiumMin: z.number().describe('Minimum estimated sodium in milligrams'),
  sodiumMax: z.number().describe('Maximum estimated sodium in milligrams'),
});

const mealAnalysisSchema = z.object({
  items: z.array(foodItemSchema).describe('Array of identified food items in the image'),
  totalCaloriesMin: z.number().describe('Total minimum calories for the entire meal'),
  totalCaloriesMax: z.number().describe('Total maximum calories for the entire meal'),
  totalProteinMin: z.number().describe('Total minimum protein for the entire meal'),
  totalProteinMax: z.number().describe('Total maximum protein for the entire meal'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Confidence level of the estimate'),
  tips: z.array(z.string()).optional().describe('Tips to improve accuracy in future photos'),
});

export async function analyzeMealPhoto(base64Image: string): Promise<MealAnalysis> {
  // Temporary offline implementation: generate deterministic pseudo-random values
  // based on the image size so the UI keeps working without calling OpenAI.
  const hash = base64Image.length || 1;

  const baseCalories = 300 + (hash % 400); // 300–699
  const protein = 10 + (hash % 30); // 10–39 g
  const carbs = 20 + (hash % 60); // 20–79 g
  const fat = 5 + (hash % 25); // 5–29 g
  const sugar = 5 + (hash % 20); // 5–24 g
  const fiber = 3 + (hash % 10); // 3–12 g
  const sodium = 200 + (hash % 800); // 200–999 mg

  const meal: MealAnalysis = {
    items: [
      {
        name: 'Makanan',
        portion: '1 porsi',
        caloriesMin: baseCalories - 50,
        caloriesMax: baseCalories + 50,
        proteinMin: protein - 3,
        proteinMax: protein + 3,
        carbsMin: carbs - 5,
        carbsMax: carbs + 5,
        fatMin: fat - 2,
        fatMax: fat + 2,
        sugarMin: sugar - 2,
        sugarMax: sugar + 2,
        fiberMin: fiber - 1,
        fiberMax: fiber + 1,
        sodiumMin: sodium - 100,
        sodiumMax: sodium + 100,
      },
    ],
    totalCaloriesMin: baseCalories - 50,
    totalCaloriesMax: baseCalories + 50,
    totalProteinMin: protein - 3,
    totalProteinMax: protein + 3,
    confidence: 'low',
    tips: [],
  };

  const validated = mealAnalysisSchema.parse(meal);
  return validated;
}
