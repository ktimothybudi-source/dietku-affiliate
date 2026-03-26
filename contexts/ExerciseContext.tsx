import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import { ExerciseEntry, StepsData } from '@/types/exercise';
import { getTodayKey } from '@/utils/nutritionCalculations';
import { useNutrition } from '@/contexts/NutritionContext';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/lib/supabase';

const STEPS_CALORIES_FACTOR = 0.04;

export const [ExerciseProvider, useExercise] = createContextHook(() => {
  const queryClient = useQueryClient();
  const { authState, selectedDate } = useNutrition();
  const [exercises, setExercises] = useState<{ [date: string]: ExerciseEntry[] }>({});
  const [stepsData, setStepsData] = useState<StepsData>({});
  const [healthConnectEnabled, setHealthConnectEnabled] = useState(false);
  const [pedometerAvailable, setPedometerAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Pedometer.isAvailableAsync().then((available: boolean) => {
        console.log('Pedometer available:', available);
        setPedometerAvailable(available);
        if (available && healthConnectEnabled) {
          const end = new Date();
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          Pedometer.getStepCountAsync(start, end).then((result: { steps: number }) => {
            console.log('Today steps from pedometer:', result.steps);
            const todayKey = getTodayKey();
            setStepsData(prev => ({ ...prev, [todayKey]: result.steps }));
          }).catch((err: unknown) => {
            console.log('Pedometer getStepCount error:', err);
          });
        }
      }).catch(() => {
        console.log('Pedometer not available');
        setPedometerAvailable(false);
      });
    }
  }, [healthConnectEnabled]);

  const exercisesQuery = useQuery({
    queryKey: ['exercise_log', authState.userId],
    queryFn: async () => {
      if (!authState.userId) return {};
      const { data, error } = await supabase
        .from('exercise_entries')
        .select('*')
        .eq('user_id', authState.userId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching exercise entries:', error);
        return {};
      }
      const grouped: { [date: string]: ExerciseEntry[] } = {};
      (data || []).forEach((row: any) => {
        const dateKey = row.date;
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push({
          id: row.id,
          type: (row.type === 'describe' || row.type === 'manual') ? row.type : 'manual',
          name: row.name,
          caloriesBurned: Number(row.calories_burned || 0),
          duration: row.duration || undefined,
          description: row.description || undefined,
          timestamp: new Date(row.created_at).getTime(),
          date: row.date,
        });
      });
      return grouped;
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  const stepsQuery = useQuery({
    queryKey: ['steps_data', authState.userId],
    queryFn: async () => {
      if (!authState.userId) return {};
      const { data, error } = await supabase
        .from('steps_data')
        .select('date, steps')
        .eq('user_id', authState.userId);
      if (error) {
        console.error('Error fetching steps data:', error);
        return {};
      }
      return Object.fromEntries((data || []).map((row: any) => [row.date, Number(row.steps || 0)]));
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  const healthConnectQuery = useQuery({
    queryKey: ['health_connect_enabled', authState.userId],
    queryFn: async () => {
      if (!authState.userId) return false;
      const { data, error } = await supabase
        .from('profiles')
        .select('health_connect_enabled')
        .eq('id', authState.userId)
        .maybeSingle();
      if (error) {
        console.error('Error fetching health connect state:', error);
        return false;
      }
      return !!(data as any)?.health_connect_enabled;
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  useEffect(() => {
    if (exercisesQuery.data) {
      setExercises(exercisesQuery.data);
    }
  }, [exercisesQuery.data]);

  useEffect(() => {
    if (stepsQuery.data) {
      setStepsData(stepsQuery.data);
    }
  }, [stepsQuery.data]);

  useEffect(() => {
    if (healthConnectQuery.data !== undefined) {
      setHealthConnectEnabled(healthConnectQuery.data);
    }
  }, [healthConnectQuery.data]);

  const saveExercisesMutation = useMutation({
    mutationFn: async (newExercises: { [date: string]: ExerciseEntry[] }) => {
      if (!authState.userId) throw new Error('Not authenticated');
      const { error: deleteError } = await supabase
        .from('exercise_entries')
        .delete()
        .eq('user_id', authState.userId);
      if (deleteError) throw deleteError;
      const payload = Object.entries(newExercises).flatMap(([date, entries]) =>
        entries.map((e) => ({
          user_id: authState.userId,
          date,
          type: (e.type === 'describe' || e.type === 'manual') ? e.type : 'quick',
          name: e.name,
          calories_burned: Math.round(e.caloriesBurned),
          duration: e.duration || null,
          description: e.description || null,
        }))
      );
      if (payload.length > 0) {
        const { error: insertError } = await supabase.from('exercise_entries').insert(payload);
        if (insertError) throw insertError;
      }
      return newExercises;
    },
    onSuccess: (data) => {
      setExercises(data);
      queryClient.setQueryData(['exercise_log', authState.userId], data);
    },
  });

  const saveStepsMutation = useMutation({
    mutationFn: async (newSteps: StepsData) => {
      if (!authState.userId) throw new Error('Not authenticated');
      const payload = Object.entries(newSteps).map(([date, steps]) => ({
        user_id: authState.userId,
        date,
        steps: Math.max(0, Math.round(steps)),
      }));
      if (payload.length > 0) {
        const { error } = await supabase
          .from('steps_data')
          .upsert(payload, { onConflict: 'user_id,date' });
        if (error) throw error;
      }
      return newSteps;
    },
    onSuccess: (data) => {
      setStepsData(data);
      queryClient.setQueryData(['steps_data', authState.userId], data);
    },
  });

  const saveHealthConnectMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!authState.userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ health_connect_enabled: enabled })
        .eq('id', authState.userId);
      if (error) throw error;
      return enabled;
    },
    onSuccess: (data) => {
      setHealthConnectEnabled(data);
    },
  });

  const addExercise = useCallback((entry: Omit<ExerciseEntry, 'id' | 'timestamp' | 'date'>) => {
    const todayKey = getTodayKey();
    const newEntry: ExerciseEntry = {
      ...entry,
      id: Date.now().toString(),
      timestamp: Date.now(),
      date: todayKey,
    };
    const dateExercises = exercises[todayKey] || [];
    const updated = {
      ...exercises,
      [todayKey]: [...dateExercises, newEntry],
    };
    saveExercisesMutation.mutate(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    console.log('Exercise added:', newEntry);
  }, [exercises, saveExercisesMutation]);

  const deleteExercise = useCallback((exerciseId: string, date: string) => {
    const dateExercises = exercises[date] || [];
    const updated = {
      ...exercises,
      [date]: dateExercises.filter(e => e.id !== exerciseId),
    };
    saveExercisesMutation.mutate(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [exercises, saveExercisesMutation]);

  const addSteps = useCallback((steps: number) => {
    const todayKey = getTodayKey();
    const current = stepsData[todayKey] || 0;
    const updated = { ...stepsData, [todayKey]: current + steps };
    saveStepsMutation.mutate(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [stepsData, saveStepsMutation]);

  const setStepsForDate = useCallback((date: string, steps: number) => {
    const updated = { ...stepsData, [date]: steps };
    saveStepsMutation.mutate(updated);
  }, [stepsData, saveStepsMutation]);

  const enableHealthConnect = useCallback(() => {
    saveHealthConnectMutation.mutate(true);
  }, [saveHealthConnectMutation]);

  const disableHealthConnect = useCallback(() => {
    saveHealthConnectMutation.mutate(false);
  }, [saveHealthConnectMutation]);

  const todayExercises = useMemo(() => {
    return exercises[selectedDate] || [];
  }, [exercises, selectedDate]);

  const todaySteps = useMemo(() => {
    return stepsData[selectedDate] || 0;
  }, [stepsData, selectedDate]);

  const stepsCaloriesBurned = useMemo(() => {
    return Math.round(todaySteps * STEPS_CALORIES_FACTOR);
  }, [todaySteps]);

  const exerciseCaloriesBurned = useMemo(() => {
    return todayExercises.reduce((sum, e) => sum + e.caloriesBurned, 0);
  }, [todayExercises]);

  const totalCaloriesBurned = useMemo(() => {
    return stepsCaloriesBurned + exerciseCaloriesBurned;
  }, [stepsCaloriesBurned, exerciseCaloriesBurned]);

  return {
    exercises,
    stepsData,
    healthConnectEnabled,
    pedometerAvailable,
    todayExercises,
    todaySteps,
    stepsCaloriesBurned,
    exerciseCaloriesBurned,
    totalCaloriesBurned,
    addExercise,
    deleteExercise,
    addSteps,
    setStepsForDate,
    enableHealthConnect,
    disableHealthConnect,
    isLoading: exercisesQuery.isLoading || stepsQuery.isLoading,
  };
});
