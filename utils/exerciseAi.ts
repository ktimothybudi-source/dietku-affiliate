import { callAIProxy } from '@/utils/aiProxy';

export type ExerciseEstimate = {
  calories: number;
  name: string;
};

export async function estimateExerciseFromText(description: string, userId?: string): Promise<ExerciseEstimate> {
  const json = await callAIProxy<any>('exercise-estimate', { description, userId });
  const content = json?.choices?.[0]?.message?.content || '';
  try {
    const match = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : content);
    return {
      calories: Math.max(1, Number(parsed?.calories) || 150),
      name: String(parsed?.name || description.slice(0, 30)),
    };
  } catch {
    return { calories: 150, name: description.slice(0, 30) };
  }
}
