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
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing EXPO_PUBLIC_OPENAI_API_KEY');
  }

  const prompt =
    'Analyze this meal photo and identify all visible food items. For each item:\n' +
    '1. Identify the food\n' +
    '2. Estimate portion size using visual cues (plate size, comparisons)\n' +
    '3. Provide calorie, macro ranges, and micronutrient estimates (sugar in grams, fiber in grams, sodium in milligrams)\n' +
    '4. Be conservative with estimates.\n\n' +
    'Respond ONLY with a single JSON object matching this TypeScript type (no extra text):\n' +
    JSON.stringify(
      {
        items: [
          {
            name: 'string',
            portion: 'string',
            caloriesMin: 0,
            caloriesMax: 0,
            proteinMin: 0,
            proteinMax: 0,
            carbsMin: 0,
            carbsMax: 0,
            fatMin: 0,
            fatMax: 0,
            sugarMin: 0,
            sugarMax: 0,
            fiberMin: 0,
            fiberMax: 0,
            sodiumMin: 0,
            sodiumMax: 0,
          },
        ],
        totalCaloriesMin: 0,
        totalCaloriesMax: 0,
        totalProteinMin: 0,
        totalProteinMax: 0,
        confidence: 'high',
        tips: ['string'],
      },
      null,
      0,
    );

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const json = (await response.json()) as any;
  const content = json.choices?.[0]?.message?.content;

  if (typeof content !== 'string') {
    throw new Error('Unexpected OpenAI response format');
  }

  // Ensure we only parse the JSON part to avoid JSON parse errors from stray text
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('OpenAI response did not contain valid JSON');
  }

  const jsonSubstring = content.slice(firstBrace, lastBrace + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSubstring);
  } catch (err) {
    throw new Error(`Failed to parse OpenAI JSON: ${(err as Error).message}`);
  }

  const validated = mealAnalysisSchema.parse(parsed);
  return validated as MealAnalysis;
}
