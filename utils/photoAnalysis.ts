import { z } from 'zod';
import { MealAnalysis } from '@/types/nutrition';
import { callAIProxy } from '@/utils/aiProxy';

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
  const json = await callAIProxy<any>('meal-analysis', { base64Image });
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response');
  }

  const cleaned = content
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();
  const parsed = JSON.parse(cleaned);
  return mealAnalysisSchema.parse(parsed);
}
