import { z } from 'zod';
import * as ImageManipulator from 'expo-image-manipulator';
import { MealAnalysis } from '@/types/nutrition';
import { AIProxyError, callAIProxy } from '@/utils/aiProxy';

/** Keep under backend `MAX_IMAGE_BASE64_LENGTH` (~2M) plus JSON wrapper headroom. */
const MAX_BASE64_CHARS = 1_850_000;

function stripDataUrlPrefix(b64: string): string {
  return b64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');
}

async function ensureMealImageUnderLimit(rawBase64: string): Promise<string> {
  let sanitized = stripDataUrlPrefix(rawBase64);
  if (sanitized.length <= MAX_BASE64_CHARS) {
    return sanitized;
  }

  let width = 1280;
  let quality = 0.72;
  let dataUri = `data:image/jpeg;base64,${sanitized}`;

  for (let attempt = 0; attempt < 5 && sanitized.length > MAX_BASE64_CHARS; attempt += 1) {
    try {
      const result = await ImageManipulator.manipulateAsync(
        dataUri,
        [{ resize: { width } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      if (!result.base64) {
        throw new Error('Could not compress meal image');
      }
      sanitized = result.base64;
      dataUri = `data:image/jpeg;base64,${sanitized}`;
    } catch (compressionError) {
      console.warn('Meal image compression failed:', compressionError);
      break;
    }
    width = Math.round(width * 0.75);
    quality = Math.max(0.45, quality - 0.08);
  }

  if (sanitized.length > MAX_BASE64_CHARS) {
    throw new Error('Gambar terlalu besar. Coba ambil foto dengan pencahayaan cukup dan jarak sedikit lebih jauh.');
  }

  return sanitized;
}

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

export type AnalyzeMealPhotoOptions = {
  /** Supabase user id — required for correct daily scan quota + premium bypass on the server. */
  userId?: string | null;
};

export async function analyzeMealPhoto(
  base64Image: string,
  options?: AnalyzeMealPhotoOptions
): Promise<MealAnalysis> {
  const base64ForApi = await ensureMealImageUnderLimit(base64Image);
  const payload: Record<string, unknown> = { base64Image: base64ForApi };
  if (options?.userId) {
    payload.userId = options.userId;
  }
  let json: any;
  try {
    json = await callAIProxy<any>('meal-analysis', payload);
  } catch (err) {
    if (err instanceof AIProxyError && err.data && typeof err.data === 'object' && err.data !== null && 'error' in err.data) {
      throw new Error(String((err.data as { error: unknown }).error));
    }
    throw err;
  }
  const content: string | undefined = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response');
  }

  const cleaned = content
    .replace(/```json/g, '')
    .replace(/```/g, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Gagal membaca hasil analisis. Coba foto lagi dengan pencahayaan lebih terang.');
  }
  try {
    return mealAnalysisSchema.parse(parsed);
  } catch (zErr) {
    if (zErr instanceof z.ZodError) {
      const first = zErr.issues[0];
      throw new Error(
        first ? `Format analisis tidak valid: ${first.path.join('.') || 'data'}` : 'Format analisis tidak valid'
      );
    }
    throw zErr;
  }
}
