import createContextHook from '@nkzw/create-context-hook';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { UserProfile, FoodEntry, DailyTargets, MealAnalysis, FavoriteMeal, RecentMeal } from '@/types/nutrition';
import { calculateDailyTargets, getTodayKey } from '@/utils/nutritionCalculations';
import { analyzeMealPhoto } from '@/utils/photoAnalysis';
import { saveImagePermanently } from '@/utils/imageStorage';
import { supabase, SupabaseProfile, SupabaseFoodEntry, SupabaseWeightHistory, SupabaseStreak } from '@/lib/supabase';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { eventEmitter } from '@/utils/eventEmitter';

interface FoodLog {
  [date: string]: FoodEntry[];
}

interface StreakData {
  currentStreak: number;
  bestStreak: number;
  lastLoggedDate: string;
  graceUsedThisWeek: boolean;
}

interface WeightEntry {
  date: string;
  weight: number;
  timestamp: number;
}

interface AuthState {
  isSignedIn: boolean;
  email: string | null;
  userId: string | null;
}

export interface PendingFoodEntry {
  id: string;
  photoUri: string;
  permanentPhotoUri?: string;
  base64: string;
  timestamp: number;
  status: 'analyzing' | 'done' | 'error';
  analysis?: MealAnalysis;
  error?: string;
}

const mapSupabaseProfileToUserProfile = (sp: SupabaseProfile): UserProfile => {
  const goal = (sp.goal === 'fat_loss' || sp.goal === 'maintenance' || sp.goal === 'muscle_gain') ? sp.goal : 'maintenance';
  
  // Derive weeklyWeightChange from goal if not stored
  let weeklyWeightChange = 0;
  if (goal === 'fat_loss') {
    weeklyWeightChange = 0.5; // Default 0.5kg/week loss
  } else if (goal === 'muscle_gain') {
    weeklyWeightChange = 0.3; // Default 0.3kg/week gain
  }
  
  return {
    name: sp.name || undefined,
    age: sp.birth_date ? Math.floor((Date.now() - new Date(sp.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 25,
    sex: (sp.gender === 'male' || sp.gender === 'female') ? sp.gender : 'male',
    height: sp.height || 170,
    weight: sp.weight || 70,
    goalWeight: sp.target_weight || sp.weight || 70,
    goal,
    activityLevel: (sp.activity_level === 'low' || sp.activity_level === 'moderate' || sp.activity_level === 'high') ? sp.activity_level : 'moderate',
    weeklyWeightChange,
  };
};

const mapSupabaseFoodEntryToFoodEntry = (sfe: SupabaseFoodEntry): FoodEntry => ({
  id: sfe.id,
  timestamp: new Date(sfe.created_at).getTime(),
  name: sfe.food_name,
  calories: sfe.calories,
  protein: sfe.protein,
  carbs: sfe.carbs,
  fat: sfe.fat,
  sugar: sfe.sugar ?? 0,
  fiber: sfe.fiber ?? 0,
  sodium: sfe.sodium ?? 0,
  photoUri: sfe.photo_uri || undefined,
});

export const [NutritionProvider, useNutrition] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [foodLog, setFoodLog] = useState<FoodLog>({});
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayKey());
  const [pendingEntries, setPendingEntries] = useState<PendingFoodEntry[]>([]);
  const [streakData, setStreakData] = useState<StreakData>({
    currentStreak: 0,
    bestStreak: 0,
    lastLoggedDate: '',
    graceUsedThisWeek: false,
  });
  const [favorites, setFavorites] = useState<FavoriteMeal[]>([]);
  const [recentMeals, setRecentMeals] = useState<RecentMeal[]>([]);
  const [authState, setAuthState] = useState<AuthState>({ isSignedIn: false, email: null, userId: null });
  const [, setSession] = useState<Session | null>(null);
  const [waterCups, setWaterCups] = useState<{ [date: string]: number }>({});
  const [sugarUnits, setSugarUnits] = useState<{ [date: string]: number }>({});
  const [fiberUnits, setFiberUnits] = useState<{ [date: string]: number }>({});
  const [sodiumUnits, setSodiumUnits] = useState<{ [date: string]: number }>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session:', session?.user?.email);
      setSession(session);
      if (session?.user) {
        setAuthState({
          isSignedIn: true,
          email: session.user.email || null,
          userId: session.user.id,
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', _event, session?.user?.email);
      setSession(session);
      if (session?.user) {
        setAuthState({
          isSignedIn: true,
          email: session.user.email || null,
          userId: session.user.id,
        });
      } else {
        setAuthState({ isSignedIn: false, email: null, userId: null });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const profileQuery = useQuery({
    queryKey: ['supabase_profile', authState.userId],
    queryFn: async () => {
      if (!authState.userId) return null;
      console.log('Fetching profile from Supabase for:', authState.userId);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authState.userId)
        .single();
      
      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }
      console.log('Profile fetched:', data);
      return data as SupabaseProfile;
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  const foodEntriesQuery = useQuery({
    queryKey: ['supabase_food_entries', authState.userId],
    queryFn: async () => {
      if (!authState.userId) return [];
      console.log('Fetching food entries from Supabase');
      const { data, error } = await supabase
        .from('food_entries')
        .select('*')
        .eq('user_id', authState.userId)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching food entries:', error);
        return [];
      }
      return data as SupabaseFoodEntry[];
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  const weightHistoryQuery = useQuery({
    queryKey: ['supabase_weight_history', authState.userId],
    queryFn: async () => {
      if (!authState.userId) return [];
      console.log('Fetching weight history from Supabase');
      const { data, error } = await supabase
        .from('weight_history')
        .select('*')
        .eq('user_id', authState.userId)
        .order('recorded_at', { ascending: true });
      
      if (error) {
        console.error('Error fetching weight history:', error);
        return [];
      }
      return data as SupabaseWeightHistory[];
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  const streakQuery = useQuery({
    queryKey: ['supabase_streak', authState.userId],
    queryFn: async () => {
      if (!authState.userId) {
        return {
          currentStreak: 0,
          bestStreak: 0,
          lastLoggedDate: '',
          graceUsedThisWeek: false,
        };
      }

      const { data, error } = await supabase
        .from('streaks')
        .select('*')
        .eq('user_id', authState.userId)
        .maybeSingle<SupabaseStreak>();

      if (error) {
        console.error('Error fetching streak from Supabase:', error);
        return {
          currentStreak: 0,
          bestStreak: 0,
          lastLoggedDate: '',
          graceUsedThisWeek: false,
        };
      }

      if (!data) {
        return {
          currentStreak: 0,
          bestStreak: 0,
          lastLoggedDate: '',
          graceUsedThisWeek: false,
        };
      }

      return {
        currentStreak: data.current_streak ?? 0,
        bestStreak: data.best_streak ?? 0,
        lastLoggedDate: data.last_logged_date ?? '',
        graceUsedThisWeek: data.grace_used_week ?? false,
      } as StreakData;
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  const favoritesQuery = useQuery({
    queryKey: ['nutrition_favorites', authState.userId],
    queryFn: async () => {
      if (!authState.userId) return [];
      const { data, error } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', authState.userId)
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Error fetching favorites:', error);
        return [];
      }
      return (data || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        calories: Number(f.calories || 0),
        protein: Number(f.protein || 0),
        carbs: Number(f.carbs || 0),
        fat: Number(f.fat || 0),
        createdAt: new Date(f.created_at).getTime(),
        logCount: Number(f.log_count || 0),
      })) as FavoriteMeal[];
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  const waterQuery = useQuery({
    queryKey: ['nutrition_water', authState.userId],
    queryFn: async () => {
      if (!authState.userId) return {};
      const { data, error } = await supabase
        .from('water_tracking')
        .select('date, cups')
        .eq('user_id', authState.userId);
      if (error) {
        console.error('Error fetching water tracking:', error);
        return {};
      }
      return Object.fromEntries((data || []).map((r: any) => [r.date, Number(r.cups || 0)]));
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  const sugarQuery = useQuery({
    queryKey: ['nutrition_sugar', authState.userId],
    queryFn: async () => {
      if (!authState.userId) return {};
      const { data, error } = await supabase
        .from('micronutrients_tracking')
        .select('date, sugar_units')
        .eq('user_id', authState.userId);
      if (error) {
        console.error('Error fetching sugar tracking:', error);
        return {};
      }
      return Object.fromEntries((data || []).map((r: any) => [r.date, Number(r.sugar_units || 0)]));
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  const fiberQuery = useQuery({
    queryKey: ['nutrition_fiber', authState.userId],
    queryFn: async () => {
      if (!authState.userId) return {};
      const { data, error } = await supabase
        .from('micronutrients_tracking')
        .select('date, fiber_units')
        .eq('user_id', authState.userId);
      if (error) {
        console.error('Error fetching fiber tracking:', error);
        return {};
      }
      return Object.fromEntries((data || []).map((r: any) => [r.date, Number(r.fiber_units || 0)]));
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  const sodiumQuery = useQuery({
    queryKey: ['nutrition_sodium', authState.userId],
    queryFn: async () => {
      if (!authState.userId) return {};
      const { data, error } = await supabase
        .from('micronutrients_tracking')
        .select('date, sodium_units')
        .eq('user_id', authState.userId);
      if (error) {
        console.error('Error fetching sodium tracking:', error);
        return {};
      }
      return Object.fromEntries((data || []).map((r: any) => [r.date, Number(r.sodium_units || 0)]));
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  const recentMealsQuery = useQuery({
    queryKey: ['nutrition_recent_meals', authState.userId],
    queryFn: async () => {
      if (!authState.userId) return [];
      const { data, error } = await supabase
        .from('recent_meals')
        .select('*')
        .eq('user_id', authState.userId)
        .order('last_logged_at', { ascending: false });
      if (error) {
        console.error('Error fetching recent meals:', error);
        return [];
      }
      return (data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        calories: Number(r.calories || 0),
        protein: Number(r.protein || 0),
        carbs: Number(r.carbs || 0),
        fat: Number(r.fat || 0),
        lastLogged: new Date(r.last_logged_at).getTime(),
        logCount: Number(r.log_count || 1),
      })) as RecentMeal[];
    },
    enabled: authState.isSignedIn && !!authState.userId,
  });

  useEffect(() => {
    if (profileQuery.data) {
      const mapped = mapSupabaseProfileToUserProfile(profileQuery.data);
      setProfile(mapped);
      console.log('Profile state updated from Supabase:', mapped);
    }
  }, [profileQuery.data]);

  useEffect(() => {
    if (foodEntriesQuery.data) {
      const grouped: FoodLog = {};
      foodEntriesQuery.data.forEach(entry => {
        const rawDate = entry.date as unknown as string;
        const dateKey = rawDate.split('T')[0];
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(mapSupabaseFoodEntryToFoodEntry(entry));
      });
      setFoodLog(grouped);
      console.log('Food log updated from Supabase');
    }
  }, [foodEntriesQuery.data]);

  useEffect(() => {
    if (weightHistoryQuery.data) {
      const mapped: WeightEntry[] = weightHistoryQuery.data.map(wh => ({
        date: wh.recorded_at.split('T')[0],
        weight: wh.weight,
        timestamp: new Date(wh.recorded_at).getTime(),
      }));
      setWeightHistory(mapped);
      console.log('Weight history updated from Supabase');
    }
  }, [weightHistoryQuery.data]);

  useEffect(() => {
    if (streakQuery.data) {
      setStreakData(streakQuery.data);
    }
  }, [streakQuery.data]);

  useEffect(() => {
    if (favoritesQuery.data) {
      setFavorites(favoritesQuery.data);
    }
  }, [favoritesQuery.data]);

  useEffect(() => {
    if (recentMealsQuery.data) {
      setRecentMeals(recentMealsQuery.data);
    }
  }, [recentMealsQuery.data]);

  useEffect(() => {
    if (waterQuery.data) {
      setWaterCups(waterQuery.data);
    }
  }, [waterQuery.data]);

  useEffect(() => {
    if (sugarQuery.data) {
      setSugarUnits(sugarQuery.data);
    }
  }, [sugarQuery.data]);

  useEffect(() => {
    if (fiberQuery.data) {
      setFiberUnits(fiberQuery.data);
    }
  }, [fiberQuery.data]);

  useEffect(() => {
    if (sodiumQuery.data) {
      setSodiumUnits(sodiumQuery.data);
    }
  }, [sodiumQuery.data]);

  const saveProfileMutation = useMutation({
    mutationFn: async (newProfile: UserProfile) => {
      if (!authState.userId) throw new Error('Not authenticated');
      
      // Calculate daily targets based on profile
      const calculatedTargets = calculateDailyTargets(newProfile);
      console.log('Saving profile to Supabase with targets:', newProfile, calculatedTargets);
      
      // Calculate birth_date from age
      const birthDate = new Date();
      birthDate.setFullYear(birthDate.getFullYear() - newProfile.age);
      const birthDateStr = birthDate.toISOString().split('T')[0];
      
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: authState.userId,
          email: authState.email,
          name: newProfile.name || null,
          gender: newProfile.sex,
          birth_date: birthDateStr,
          height: newProfile.height,
          weight: newProfile.weight,
          target_weight: newProfile.goalWeight,
          activity_level: newProfile.activityLevel,
          goal: newProfile.goal,
          daily_calories: calculatedTargets.calories,
          protein_target: calculatedTargets.protein,
          carbs_target: Math.round((calculatedTargets.carbsMin + calculatedTargets.carbsMax) / 2),
          fat_target: Math.round((calculatedTargets.fatMin + calculatedTargets.fatMax) / 2),
          updated_at: new Date().toISOString(),
        });
      
      if (error) {
        console.error('Error saving profile:', error);
        throw error;
      }
      return newProfile;
    },
    onSuccess: (data) => {
      setProfile(data);
      queryClient.invalidateQueries({ queryKey: ['supabase_profile'] });
      console.log('Profile saved successfully');
    },
  });

  const saveFoodEntryMutation = useMutation({
    mutationFn: async ({ entry, dateKey }: { entry: Omit<FoodEntry, 'id' | 'timestamp'>; dateKey: string }) => {
      if (!authState.userId) {
        console.error('Save food entry failed: Not authenticated, userId:', authState.userId);
        throw new Error('Not authenticated');
      }
      
      console.log('Saving food entry to Supabase:', {
        userId: authState.userId,
        date: dateKey,
        entry: entry,
      });
      
      const insertData = {
        user_id: authState.userId,
        date: dateKey,
        food_name: entry.name,
        calories: Math.round(entry.calories || 0),
        protein: Math.round(entry.protein || 0),
        carbs: Math.round(entry.carbs || 0),
        fat: Math.round(entry.fat || 0),
        sugar: Math.round((entry.sugar || 0) * 10) / 10,
        fiber: Math.round((entry.fiber || 0) * 10) / 10,
        sodium: Math.round(entry.sodium || 0),
        photo_uri: entry.photoUri || null,
      };
      
      console.log('Insert data:', insertData);
      
      const { data, error } = await supabase
        .from('food_entries')
        .insert(insertData)
        .select()
        .single();
      
      if (error) {
        console.error('Error saving food entry:', error.message, error.code, error.details, error.hint);
        throw new Error(`Failed to save food: ${error.message}`);
      }
      
      console.log('Food entry saved successfully:', data);
      return data as SupabaseFoodEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase_food_entries'] });
      console.log('Food entry mutation completed successfully');
    },
    onError: (error) => {
      console.error('Food entry mutation error:', error);
    },
  });

  const deleteFoodEntryMutation = useMutation({
    mutationFn: async (entryId: string) => {
      if (!authState.userId) throw new Error('Not authenticated');
      
      console.log('Deleting food entry:', entryId);
      const { error } = await supabase
        .from('food_entries')
        .delete()
        .eq('id', entryId)
        .eq('user_id', authState.userId);
      
      if (error) {
        console.error('Error deleting food entry:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase_food_entries'] });
    },
  });

  const updateFoodEntryMutation = useMutation({
    mutationFn: async ({ entryId, updates }: { entryId: string; updates: Omit<FoodEntry, 'id' | 'timestamp'> }) => {
      if (!authState.userId) throw new Error('Not authenticated');
      
      console.log('Updating food entry:', entryId, updates);
      const { error } = await supabase
        .from('food_entries')
        .update({
          food_name: updates.name,
          calories: updates.calories,
          protein: updates.protein,
          carbs: updates.carbs,
          fat: updates.fat,
          photo_uri: updates.photoUri || null,
        })
        .eq('id', entryId)
        .eq('user_id', authState.userId);
      
      if (error) {
        console.error('Error updating food entry:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase_food_entries'] });
    },
  });

  const saveWeightHistoryMutation = useMutation({
    mutationFn: async ({ dateKey, weight }: { dateKey: string; weight: number }) => {
      if (!authState.userId) throw new Error('Not authenticated');
      
      console.log('Saving weight to Supabase:', { dateKey, weight });
      const recordedAt = new Date(`${dateKey}T00:00:00.000Z`).toISOString();
      const utcDayStart = recordedAt;
      const utcNext = new Date(utcDayStart);
      utcNext.setUTCDate(utcNext.getUTCDate() + 1);
      const utcDayEnd = utcNext.toISOString();

      const [year, month, day] = dateKey.split('-').map(Number);
      const localDayStartDate = new Date(year, month - 1, day);
      localDayStartDate.setHours(0, 0, 0, 0);
      const localDayStart = localDayStartDate.toISOString();
      const localDayEndDate = new Date(localDayStartDate);
      localDayEndDate.setDate(localDayEndDate.getDate() + 1);
      const localDayEnd = localDayEndDate.toISOString();

      const { data: existingRowsUtc, error: selectUtcError } = await supabase
        .from('weight_history')
        .select('id, recorded_at')
        .eq('user_id', authState.userId)
        .gte('recorded_at', utcDayStart)
        .lt('recorded_at', utcDayEnd);

      if (selectUtcError) {
        console.error('Error checking existing weight row (UTC window):', selectUtcError);
        throw selectUtcError;
      }

      const { data: existingRowsLocal, error: selectLocalError } = await supabase
        .from('weight_history')
        .select('id, recorded_at')
        .eq('user_id', authState.userId)
        .gte('recorded_at', localDayStart)
        .lt('recorded_at', localDayEnd);

      if (selectLocalError) {
        console.error('Error checking existing weight row (local window):', selectLocalError);
        throw selectLocalError;
      }

      const merged = [...(existingRowsUtc || []), ...(existingRowsLocal || [])];
      const uniqueById = Array.from(new Map(merged.map((row: any) => [row.id, row])).values());
      const existingRow = uniqueById.sort((a: any, b: any) => b.recorded_at.localeCompare(a.recorded_at))[0];

      if (existingRow?.id) {
        const { error: updateError } = await supabase
          .from('weight_history')
          .update({ weight })
          .eq('id', existingRow.id)
          .eq('user_id', authState.userId);

        if (updateError) {
          console.error('Error updating existing weight row:', updateError);
          throw updateError;
        }

        if (uniqueById.length > 1) {
          const duplicateIds = uniqueById.filter((row: any) => row.id !== existingRow.id).map((row: any) => row.id);
          if (duplicateIds.length > 0) {
            const { error: deleteDupError } = await supabase
              .from('weight_history')
              .delete()
              .in('id', duplicateIds)
              .eq('user_id', authState.userId);
            if (deleteDupError) {
              console.error('Error deleting duplicate weight rows:', deleteDupError);
            }
          }
        }
      } else {
        const { error: insertError } = await supabase
          .from('weight_history')
          .insert({
            user_id: authState.userId,
            weight,
            recorded_at: recordedAt,
          });

        if (insertError) {
          console.error('Error inserting weight row:', insertError);
          throw insertError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase_weight_history'] });
    },
  });

  const deleteWeightHistoryMutation = useMutation({
    mutationFn: async (dateKey: string) => {
      if (!authState.userId) throw new Error('Not authenticated');
      const recordedAt = new Date(`${dateKey}T00:00:00.000Z`).toISOString();
      const utcDayStart = recordedAt;
      const utcNext = new Date(utcDayStart);
      utcNext.setUTCDate(utcNext.getUTCDate() + 1);
      const utcDayEnd = utcNext.toISOString();

      const [year, month, day] = dateKey.split('-').map(Number);
      const localDayStartDate = new Date(year, month - 1, day);
      localDayStartDate.setHours(0, 0, 0, 0);
      const localDayStart = localDayStartDate.toISOString();
      const localDayEndDate = new Date(localDayStartDate);
      localDayEndDate.setDate(localDayEndDate.getDate() + 1);
      const localDayEnd = localDayEndDate.toISOString();

      const { data: rowsUtc, error: selectUtcError } = await supabase
        .from('weight_history')
        .select('id')
        .eq('user_id', authState.userId)
        .gte('recorded_at', utcDayStart)
        .lt('recorded_at', utcDayEnd);

      if (selectUtcError) {
        console.error('Error selecting weight rows for deletion (UTC):', selectUtcError);
        throw selectUtcError;
      }

      const { data: rowsLocal, error: selectLocalError } = await supabase
        .from('weight_history')
        .select('id')
        .eq('user_id', authState.userId)
        .gte('recorded_at', localDayStart)
        .lt('recorded_at', localDayEnd);

      if (selectLocalError) {
        console.error('Error selecting weight rows for deletion (local):', selectLocalError);
        throw selectLocalError;
      }

      const mergedRows = [...(rowsUtc || []), ...(rowsLocal || [])];
      const ids = Array.from(new Set(mergedRows.map((row: any) => row.id)));

      if (ids.length === 0) return;

      const { error } = await supabase
        .from('weight_history')
        .delete()
        .eq('user_id', authState.userId)
        .in('id', ids);
      
      if (error) {
        console.error('Error deleting weight:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supabase_weight_history'] });
    },
  });

  const saveStreakMutation = useMutation({
    mutationFn: async (newStreak: StreakData) => {
      if (!authState.userId) {
        throw new Error('Not authenticated');
      }

      const payload = {
        user_id: authState.userId,
        current_streak: newStreak.currentStreak,
        best_streak: newStreak.bestStreak,
        last_logged_date: newStreak.lastLoggedDate || null,
        grace_used_week: newStreak.graceUsedThisWeek,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('streaks')
        .upsert(payload, {
          onConflict: 'user_id',
        })
        .select()
        .maybeSingle<SupabaseStreak>();

      if (error) {
        console.error('Error saving streak to Supabase:', error);
        throw error;
      }

      return newStreak;
    },
    onSuccess: (data) => {
      setStreakData(data);
      queryClient.setQueryData(['supabase_streak', authState.userId], data);
    },
  });

  const saveFavoritesMutation = useMutation({
    mutationFn: async (newFavorites: FavoriteMeal[]) => {
      if (!authState.userId) throw new Error('Not authenticated');
      const { error: deleteError } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', authState.userId);
      if (deleteError) throw deleteError;
      if (newFavorites.length > 0) {
        const payload = newFavorites.map((f) => ({
          user_id: authState.userId,
          name: f.name,
          calories: f.calories,
          protein: f.protein,
          carbs: f.carbs,
          fat: f.fat,
          log_count: Math.max(0, Math.round(f.logCount || 0)),
        }));
        const { error: insertError } = await supabase.from('favorites').insert(payload);
        if (insertError) throw insertError;
      }
      const { data, error } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', authState.userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        calories: Number(f.calories || 0),
        protein: Number(f.protein || 0),
        carbs: Number(f.carbs || 0),
        fat: Number(f.fat || 0),
        createdAt: new Date(f.created_at).getTime(),
        logCount: Number(f.log_count || 0),
      })) as FavoriteMeal[];
    },
    onSuccess: (data) => {
      setFavorites(data);
      queryClient.setQueryData(['nutrition_favorites', authState.userId], data);
    },
  });

  const saveWaterMutation = useMutation({
    mutationFn: async (newWater: { [date: string]: number }) => {
      if (!authState.userId) throw new Error('Not authenticated');
      const upserts = Object.entries(newWater).map(([date, cups]) => ({
        user_id: authState.userId,
        date,
        cups: Math.max(0, Math.round(cups)),
      }));
      if (upserts.length > 0) {
        const { error } = await supabase
          .from('water_tracking')
          .upsert(upserts, { onConflict: 'user_id,date' });
        if (error) throw error;
      }
      return newWater;
    },
    onSuccess: (data) => {
      setWaterCups(data);
      queryClient.setQueryData(['nutrition_water', authState.userId], data);
    },
  });

  const saveSugarMutation = useMutation({
    mutationFn: async (newData: { [date: string]: number }) => {
      if (!authState.userId) throw new Error('Not authenticated');
      const upserts = Object.entries(newData).map(([date, sugarUnitsValue]) => ({
        user_id: authState.userId,
        date,
        sugar_units: Math.max(0, Number(sugarUnitsValue || 0)),
      }));
      if (upserts.length > 0) {
        const { error } = await supabase
          .from('micronutrients_tracking')
          .upsert(upserts, { onConflict: 'user_id,date' });
        if (error) throw error;
      }
      return newData;
    },
    onSuccess: (data) => {
      setSugarUnits(data);
      queryClient.setQueryData(['nutrition_sugar', authState.userId], data);
    },
  });

  const saveFiberMutation = useMutation({
    mutationFn: async (newData: { [date: string]: number }) => {
      if (!authState.userId) throw new Error('Not authenticated');
      const upserts = Object.entries(newData).map(([date, fiberUnitsValue]) => ({
        user_id: authState.userId,
        date,
        fiber_units: Math.max(0, Number(fiberUnitsValue || 0)),
      }));
      if (upserts.length > 0) {
        const { error } = await supabase
          .from('micronutrients_tracking')
          .upsert(upserts, { onConflict: 'user_id,date' });
        if (error) throw error;
      }
      return newData;
    },
    onSuccess: (data) => {
      setFiberUnits(data);
      queryClient.setQueryData(['nutrition_fiber', authState.userId], data);
    },
  });

  const saveSodiumMutation = useMutation({
    mutationFn: async (newData: { [date: string]: number }) => {
      if (!authState.userId) throw new Error('Not authenticated');
      const upserts = Object.entries(newData).map(([date, sodiumUnitsValue]) => ({
        user_id: authState.userId,
        date,
        sodium_units: Math.max(0, Math.round(Number(sodiumUnitsValue || 0))),
      }));
      if (upserts.length > 0) {
        const { error } = await supabase
          .from('micronutrients_tracking')
          .upsert(upserts, { onConflict: 'user_id,date' });
        if (error) throw error;
      }
      return newData;
    },
    onSuccess: (data) => {
      setSodiumUnits(data);
      queryClient.setQueryData(['nutrition_sodium', authState.userId], data);
    },
  });

  const saveRecentMealsMutation = useMutation({
    mutationFn: async (newRecent: RecentMeal[]) => {
      if (!authState.userId) throw new Error('Not authenticated');
      const { error: deleteError } = await supabase
        .from('recent_meals')
        .delete()
        .eq('user_id', authState.userId);
      if (deleteError) throw deleteError;
      if (newRecent.length > 0) {
        const payload = newRecent.slice(0, 50).map((r) => ({
          user_id: authState.userId,
          name: r.name,
          calories: r.calories,
          protein: r.protein,
          carbs: r.carbs,
          fat: r.fat,
          log_count: Math.max(0, Math.round(r.logCount || 1)),
          last_logged_at: new Date(r.lastLogged).toISOString(),
        }));
        const { error: insertError } = await supabase.from('recent_meals').insert(payload);
        if (insertError) throw insertError;
      }
      const { data, error } = await supabase
        .from('recent_meals')
        .select('*')
        .eq('user_id', authState.userId)
        .order('last_logged_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        calories: Number(r.calories || 0),
        protein: Number(r.protein || 0),
        carbs: Number(r.carbs || 0),
        fat: Number(r.fat || 0),
        lastLogged: new Date(r.last_logged_at).getTime(),
        logCount: Number(r.log_count || 1),
      })) as RecentMeal[];
    },
    onSuccess: (data) => {
      setRecentMeals(data);
      queryClient.setQueryData(['nutrition_recent_meals', authState.userId], data);
    },
  });

  const updateStreak = (dateKey: string) => {
    const today = new Date();
    const todayKey = getTodayKey();

    // Normalize new log date
    const [year, month, day] = dateKey.split('-').map(Number);
    const logDate = new Date(year, month - 1, day);
    logDate.setHours(0, 0, 0, 0);

    let newStreak = { ...streakData };

    // If we've never logged before, start streak at this date (as long as it's not in the future)
    if (!newStreak.lastLoggedDate) {
      if (dateKey <= todayKey) {
        newStreak.currentStreak = 1;
        newStreak.lastLoggedDate = dateKey;
      }
    } else {
      const lastDateParts = newStreak.lastLoggedDate.split('-').map(Number);
      const lastLogDate = new Date(lastDateParts[0], lastDateParts[1] - 1, lastDateParts[2]);
      lastLogDate.setHours(0, 0, 0, 0);

      const diffDays = Math.round((logDate.getTime() - lastLogDate.getTime()) / (1000 * 60 * 60 * 24));

      // Ignore logs that are before the last logged date (backfilling earlier history)
      if (diffDays <= 0) {
        return;
      }

      if (diffDays === 1) {
        // Perfect consecutive day, extend streak
        newStreak.currentStreak = newStreak.currentStreak + 1;
        newStreak.lastLoggedDate = dateKey;
      } else if (diffDays === 2 && !newStreak.graceUsedThisWeek) {
        // One missed day, consume grace and still extend
        newStreak.currentStreak = newStreak.currentStreak + 1;
        newStreak.graceUsedThisWeek = true;
        newStreak.lastLoggedDate = dateKey;
      } else if (diffDays > 0) {
        // Bigger gap: start a new streak from this date
        newStreak.currentStreak = 1;
        newStreak.lastLoggedDate = dateKey;
      }

      // Weekly reset of grace flag based on calendar week
      const startOfWeek = new Date(today);
      startOfWeek.setHours(0, 0, 0, 0);
      startOfWeek.setDate(today.getDate() - today.getDay());
      if (lastLogDate < startOfWeek) {
        newStreak.graceUsedThisWeek = false;
      }
    }

    if (newStreak.currentStreak > newStreak.bestStreak) {
      newStreak.bestStreak = newStreak.currentStreak;
    }

    if (JSON.stringify(newStreak) !== JSON.stringify(streakData)) {
      saveStreakMutation.mutate(newStreak);
    }
  };

  const saveProfile = useCallback((newProfile: UserProfile) => {
    console.log('Saving profile:', newProfile);
    saveProfileMutation.mutate(newProfile);
    
    const todayKey = getTodayKey();
    const existingEntry = weightHistory.find(entry => entry.date === todayKey);
    
    if (!existingEntry && profile && newProfile.weight !== profile.weight) {
      saveWeightHistoryMutation.mutate({ dateKey: todayKey, weight: newProfile.weight });
    } else if (existingEntry && newProfile.weight !== existingEntry.weight) {
      saveWeightHistoryMutation.mutate({ dateKey: todayKey, weight: newProfile.weight });
    }
  }, [profile, weightHistory, saveProfileMutation, saveWeightHistoryMutation]);

  const updateRecentMeals = useCallback((entry: Omit<FoodEntry, 'id' | 'timestamp'>) => {
    const normalizedName = entry.name.toLowerCase().trim();
    const existingIndex = recentMeals.findIndex(
      m => m.name.toLowerCase().trim() === normalizedName
    );

    let updatedRecent: RecentMeal[];
    if (existingIndex >= 0) {
      const existing = recentMeals[existingIndex];
      updatedRecent = [
        { ...existing, lastLogged: Date.now(), logCount: existing.logCount + 1 },
        ...recentMeals.filter((_, i) => i !== existingIndex),
      ];
    } else {
      const newRecent: RecentMeal = {
        id: Date.now().toString(),
        name: entry.name,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        lastLogged: Date.now(),
        logCount: 1,
      };
      updatedRecent = [newRecent, ...recentMeals].slice(0, 50);
    }
    saveRecentMealsMutation.mutate(updatedRecent);
  }, [recentMeals, saveRecentMealsMutation]);

  const addFoodEntry = useCallback((entry: Omit<FoodEntry, 'id' | 'timestamp'>, autoPostToCommunity: boolean = true) => {
    console.log('[addFoodEntry] Adding entry:', entry);
    console.log('[addFoodEntry] Auth state:', authState);
    
    if (!authState.isSignedIn || !authState.userId) {
      console.error('[addFoodEntry] Cannot add food: User not authenticated');
      return;
    }
    
    const logDateKey = selectedDate || getTodayKey();
    saveFoodEntryMutation.mutate(
      { entry, dateKey: logDateKey },
      {
        onSuccess: () => {
          updateStreak(logDateKey);
          updateRecentMeals(entry);

          if (autoPostToCommunity) {
            const eventData = {
              foodEntry: entry,
              timestamp: Date.now(),
            };
            eventEmitter.emit('foodEntryAdded', eventData);
          }
        },
      }
    );
  }, [saveFoodEntryMutation, authState, selectedDate, updateRecentMeals]);

  const { mutate: mutateFavorites } = saveFavoritesMutation;

  const addToFavorites = useCallback((meal: Omit<FavoriteMeal, 'id' | 'createdAt' | 'logCount'>) => {
    const normalizedName = meal.name.toLowerCase().trim();
    const exists = favorites.some(f => f.name.toLowerCase().trim() === normalizedName);
    if (exists) return false;

    const newFavorite: FavoriteMeal = {
      ...meal,
      id: Date.now().toString(),
      createdAt: Date.now(),
      logCount: 0,
    };
    mutateFavorites([newFavorite, ...favorites]);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  }, [favorites, mutateFavorites]);

  const removeFromFavorites = useCallback((favoriteId: string) => {
    const updatedFavorites = favorites.filter(f => f.id !== favoriteId);
    mutateFavorites(updatedFavorites);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [favorites, mutateFavorites]);

  const updateFavorite = useCallback((favoriteId: string, updates: Partial<Omit<FavoriteMeal, 'id' | 'createdAt'>>) => {
    const updatedFavorites = favorites.map(f =>
      f.id === favoriteId ? { ...f, ...updates } : f
    );
    mutateFavorites(updatedFavorites);
  }, [favorites, mutateFavorites]);

  const reorderFavorites = useCallback((newOrder: FavoriteMeal[]) => {
    mutateFavorites(newOrder);
  }, [mutateFavorites]);

  const isFavorite = useCallback((mealName: string) => {
    const normalizedName = mealName.toLowerCase().trim();
    return favorites.some(f => f.name.toLowerCase().trim() === normalizedName);
  }, [favorites]);

  const logFromFavorite = useCallback((favoriteId: string) => {
    const favorite = favorites.find(f => f.id === favoriteId);
    if (!favorite) return;

    addFoodEntry({
      name: favorite.name,
      calories: favorite.calories,
      protein: favorite.protein,
      carbs: favorite.carbs,
      fat: favorite.fat,
    });

    const updatedFavorites = favorites.map(f =>
      f.id === favoriteId ? { ...f, logCount: f.logCount + 1 } : f
    );
    mutateFavorites(updatedFavorites);
  }, [favorites, addFoodEntry, mutateFavorites]);

  const logFromRecent = useCallback((recentId: string) => {
    const recent = recentMeals.find(r => r.id === recentId);
    if (!recent) return;

    addFoodEntry({
      name: recent.name,
      calories: recent.calories,
      protein: recent.protein,
      carbs: recent.carbs,
      fat: recent.fat,
    });
  }, [recentMeals, addFoodEntry]);

  const { mutate: mutateRecentMeals } = saveRecentMealsMutation;

  const signIn = useCallback(async (email: string, password: string) => {
    console.log('Signing in user:', email);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.error('Sign in error:', error);
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('INVALID_CREDENTIALS');
      }
      throw error;
    }
    
    console.log('Sign in successful:', data.user?.email);
    return data;
  }, []);

  const signUp = useCallback(async (email: string, password: string, profileData?: Partial<UserProfile> & { birthDate?: Date }) => {
    console.log('Signing up user:', email);
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: profileData?.name || null,
          gender: profileData?.sex || null,
          height: profileData?.height || null,
          weight: profileData?.weight || null,
          target_weight: profileData?.goalWeight || null,
          activity_level: profileData?.activityLevel || null,
          goal: profileData?.goal || null,
        },
      },
    });
    
    if (error) {
      console.error('Sign up error:', error.message, error);
      throw error;
    }

    console.log('Sign up response:', { user: data.user?.id, session: !!data.session });
    
    if (!data.user) {
      throw new Error('No user returned from sign up');
    }

    // Check if we have a session (email confirmation disabled) or not (email confirmation enabled)
    if (data.session && profileData) {
      // User is immediately authenticated, create profile
      console.log('Session available, creating profile...');
      
      // Calculate birth_date from birthDate or age
      let birthDateStr: string | null = null;
      if (profileData.birthDate) {
        birthDateStr = profileData.birthDate.toISOString().split('T')[0];
      } else if (profileData.age) {
        const birthDate = new Date();
        birthDate.setFullYear(birthDate.getFullYear() - profileData.age);
        birthDateStr = birthDate.toISOString().split('T')[0];
      }
      
      // Calculate targets for the new profile
      const newProfileForCalc: UserProfile = {
        name: profileData.name,
        age: profileData.age || 25,
        sex: profileData.sex || 'male',
        height: profileData.height || 170,
        weight: profileData.weight || 70,
        goalWeight: profileData.goalWeight || profileData.weight || 70,
        goal: profileData.goal || 'maintenance',
        activityLevel: profileData.activityLevel || 'moderate',
        weeklyWeightChange: profileData.weeklyWeightChange,
      };
      const calculatedTargets = calculateDailyTargets(newProfileForCalc);
      console.log('Calculated targets for new user:', calculatedTargets, 'birthDate:', birthDateStr);
      
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: data.user.id,
          email: email,
          name: profileData.name || null,
          gender: profileData.sex || null,
          birth_date: birthDateStr,
          height: profileData.height || null,
          weight: profileData.weight || null,
          target_weight: profileData.goalWeight || null,
          activity_level: profileData.activityLevel || null,
          goal: profileData.goal || null,
          daily_calories: calculatedTargets.calories,
          protein_target: calculatedTargets.protein,
          carbs_target: Math.round((calculatedTargets.carbsMin + calculatedTargets.carbsMax) / 2),
          fat_target: Math.round((calculatedTargets.fatMin + calculatedTargets.fatMax) / 2),
        });
      
      if (profileError) {
        console.error('Error creating profile:', profileError.message, profileError);
        // Don't throw here, user is created but profile failed - can retry later
      } else {
        console.log('Profile created successfully');
        // Set the profile locally immediately so we don't wait for query
        const newProfile: UserProfile = {
          name: profileData.name,
          age: profileData.age || 25,
          sex: profileData.sex || 'male',
          height: profileData.height || 170,
          weight: profileData.weight || 70,
          goalWeight: profileData.goalWeight || profileData.weight || 70,
          goal: profileData.goal || 'maintenance',
          activityLevel: profileData.activityLevel || 'moderate',
        };
        setProfile(newProfile);
        // Also invalidate queries to refresh from server
        queryClient.invalidateQueries({ queryKey: ['supabase_profile'] });
      }
    } else if (!data.session) {
      // Email confirmation is required - but user trigger should create empty profile
      console.log('Email confirmation required or user already exists. Check your email.');
    }
    
    console.log('Sign up successful:', data.user?.email);
    return data;
  }, [queryClient]);

  const signOut = useCallback(async () => {
    console.log('Signing out user');
    await supabase.auth.signOut();
    setProfile(null);
    setFoodLog({});
    setWeightHistory([]);
    setStreakData({
      currentStreak: 0,
      bestStreak: 0,
      lastLoggedDate: '',
      graceUsedThisWeek: false,
    });
    setFavorites([]);
    setRecentMeals([]);
    queryClient.clear();
    setTimeout(() => {
      router.replace('/onboarding');
    }, 100);
  }, [queryClient]);

  const addWaterCup = useCallback(() => {
    const dateKey = selectedDate || getTodayKey();
    const current = waterCups[dateKey] || 0;
    const updated = { ...waterCups, [dateKey]: current + 1 };
    saveWaterMutation.mutate(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [waterCups, saveWaterMutation, selectedDate]);

  const removeWaterCup = useCallback(() => {
    const dateKey = selectedDate || getTodayKey();
    const current = waterCups[dateKey] || 0;
    if (current <= 0) return;
    const updated = { ...waterCups, [dateKey]: current - 1 };
    saveWaterMutation.mutate(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [waterCups, saveWaterMutation, selectedDate]);

  const getTodayWaterCups = useCallback(() => {
    return waterCups[selectedDate] || 0;
  }, [waterCups, selectedDate]);

  const addSugarUnit = useCallback((amount: number = 1) => {
    const dateKey = selectedDate || getTodayKey();
    const current = sugarUnits[dateKey] || 0;
    const updated = { ...sugarUnits, [dateKey]: Math.round((current + amount) * 10) / 10 };
    saveSugarMutation.mutate(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [sugarUnits, saveSugarMutation, selectedDate]);

  const removeSugarUnit = useCallback(() => {
    const dateKey = selectedDate || getTodayKey();
    const current = sugarUnits[dateKey] || 0;
    if (current <= 0) return;
    const updated = { ...sugarUnits, [dateKey]: current - 1 };
    saveSugarMutation.mutate(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [sugarUnits, saveSugarMutation, selectedDate]);

  const getTodaySugarUnits = useCallback(() => {
    return sugarUnits[selectedDate] || 0;
  }, [sugarUnits, selectedDate]);

  const addFiberUnit = useCallback((amount: number = 1) => {
    const dateKey = selectedDate || getTodayKey();
    const current = fiberUnits[dateKey] || 0;
    const updated = { ...fiberUnits, [dateKey]: Math.round((current + amount) * 10) / 10 };
    saveFiberMutation.mutate(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [fiberUnits, saveFiberMutation, selectedDate]);

  const removeFiberUnit = useCallback(() => {
    const dateKey = selectedDate || getTodayKey();
    const current = fiberUnits[dateKey] || 0;
    if (current <= 0) return;
    const updated = { ...fiberUnits, [dateKey]: current - 1 };
    saveFiberMutation.mutate(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [fiberUnits, saveFiberMutation, selectedDate]);

  const getTodayFiberUnits = useCallback(() => {
    return fiberUnits[selectedDate] || 0;
  }, [fiberUnits, selectedDate]);

  const addSodiumUnit = useCallback((amount: number = 1) => {
    const dateKey = selectedDate || getTodayKey();
    const current = sodiumUnits[dateKey] || 0;
    const updated = { ...sodiumUnits, [dateKey]: Math.round(current + amount) };
    saveSodiumMutation.mutate(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [sodiumUnits, saveSodiumMutation, selectedDate]);

  const removeSodiumUnit = useCallback(() => {
    const dateKey = selectedDate || getTodayKey();
    const current = sodiumUnits[dateKey] || 0;
    if (current <= 0) return;
    const updated = { ...sodiumUnits, [dateKey]: current - 1 };
    saveSodiumMutation.mutate(updated);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [sodiumUnits, saveSodiumMutation, selectedDate]);

  const getTodaySodiumUnits = useCallback(() => {
    return sodiumUnits[selectedDate] || 0;
  }, [sodiumUnits, selectedDate]);

  const removeFromRecent = useCallback((recentId: string) => {
    const updatedRecent = recentMeals.filter(r => r.id !== recentId);
    mutateRecentMeals(updatedRecent);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [recentMeals, mutateRecentMeals]);

  const addWeightEntry = useCallback((dateKey: string, weight: number) => {
    console.log('Adding weight entry:', { dateKey, weight });
    saveWeightHistoryMutation.mutate({ dateKey, weight });
    
    const latestDateKey = weightHistory.length > 0
      ? [...weightHistory].sort((a, b) => a.date.localeCompare(b.date))[weightHistory.length - 1].date
      : null;
    const shouldAffectCurrentWeight = !latestDateKey || dateKey >= latestDateKey;

    if (profile && shouldAffectCurrentWeight) {
      const updatedProfile = { ...profile, weight };
      saveProfileMutation.mutate(updatedProfile);
    }
  }, [saveWeightHistoryMutation, profile, saveProfileMutation]);

  const updateWeightEntry = useCallback((dateKey: string, newWeight: number) => {
    console.log('Updating weight entry:', { dateKey, newWeight });
    saveWeightHistoryMutation.mutate({ dateKey, weight: newWeight });
    
    const latestEntry = [...weightHistory].sort((a, b) => b.date.localeCompare(a.date))[0];
    
    if (profile && latestEntry && latestEntry.date === dateKey) {
      const updatedProfile = { ...profile, weight: newWeight };
      saveProfileMutation.mutate(updatedProfile);
    }
  }, [weightHistory, saveWeightHistoryMutation, profile, saveProfileMutation]);

  const deleteWeightEntry = useCallback((dateKey: string) => {
    console.log('Deleting weight entry:', { dateKey });
    deleteWeightHistoryMutation.mutate(dateKey);
    
    const updatedHistory = weightHistory.filter(entry => entry.date !== dateKey);
    if (updatedHistory.length > 0 && profile) {
      const sortedHistory = [...updatedHistory].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      const latestEntry = sortedHistory[0];
      if (latestEntry.weight !== profile.weight) {
        const updatedProfile = { ...profile, weight: latestEntry.weight };
        saveProfileMutation.mutate(updatedProfile);
      }
    }
  }, [weightHistory, deleteWeightHistoryMutation, profile, saveProfileMutation]);

  const shouldSuggestFavorite = useCallback((mealName: string): boolean => {
    const normalizedName = mealName.toLowerCase().trim();
    if (favorites.some(f => f.name.toLowerCase().trim() === normalizedName)) {
      return false;
    }
    const recent = recentMeals.find(r => r.name.toLowerCase().trim() === normalizedName);
    return recent ? recent.logCount >= 3 : false;
  }, [favorites, recentMeals]);

  const addPendingEntry = useCallback((photoUri: string, base64: string) => {
    const newPending: PendingFoodEntry = {
      id: Date.now().toString(),
      photoUri,
      base64,
      timestamp: Date.now(),
      status: 'analyzing',
    };
    setPendingEntries(prev => [...prev, newPending]);

    saveImagePermanently(photoUri)
      .then((permanentUri) => {
        setPendingEntries(prev =>
          prev.map(entry =>
            entry.id === newPending.id
              ? { ...entry, permanentPhotoUri: permanentUri }
              : entry
          )
        );
        console.log('Image saved permanently:', permanentUri);
      })
      .catch((error) => {
        console.error('Error saving image:', error);
      });

    analyzeMealPhoto(base64)
      .then((analysis) => {
        setPendingEntries(prev =>
          prev.map(entry =>
            entry.id === newPending.id
              ? { ...entry, status: 'done' as const, analysis }
              : entry
          )
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      })
      .catch((error) => {
        console.warn('Photo analysis error:', error);
        setPendingEntries(prev =>
          prev.map(entry =>
            entry.id === newPending.id
              ? { ...entry, status: 'error' as const, error: 'Gagal menganalisis foto' }
              : entry
          )
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      });

    return newPending.id;
  }, []);

  const confirmPendingEntry = useCallback((pendingId: string, servings: number = 1) => {
    const pending = pendingEntries.find(p => p.id === pendingId);
    if (!pending || pending.status !== 'done' || !pending.analysis) return;

    const analysis = pending.analysis;
    const avgCalories = Math.round((analysis.totalCaloriesMin + analysis.totalCaloriesMax) / 2) * servings;
    const avgProtein = Math.round((analysis.totalProteinMin + analysis.totalProteinMax) / 2) * servings;
    const avgCarbs = analysis.items.reduce((sum, item) => sum + (item.carbsMin + item.carbsMax) / 2, 0) * servings;
    const avgFat = analysis.items.reduce((sum, item) => sum + (item.fatMin + item.fatMax) / 2, 0) * servings;
    const foodNames = analysis.items.map(item => item.name).join(', ');

    addFoodEntry({
      name: foodNames,
      calories: Math.round(avgCalories),
      protein: Math.round(avgProtein),
      carbs: Math.round(avgCarbs),
      fat: Math.round(avgFat),
      photoUri: pending.permanentPhotoUri || pending.photoUri,
    });

    setPendingEntries(prev => prev.filter(p => p.id !== pendingId));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [pendingEntries, addFoodEntry]);

  const removePendingEntry = useCallback((pendingId: string) => {
    setPendingEntries(prev => prev.filter(p => p.id !== pendingId));
  }, []);

  const retryPendingEntry = useCallback((pendingId: string) => {
    const pending = pendingEntries.find(p => p.id === pendingId);
    if (!pending) return;

    setPendingEntries(prev =>
      prev.map(entry =>
        entry.id === pendingId
          ? { ...entry, status: 'analyzing' as const, error: undefined }
          : entry
      )
    );

    analyzeMealPhoto(pending.base64)
      .then((analysis) => {
        setPendingEntries(prev =>
          prev.map(entry =>
            entry.id === pendingId
              ? { ...entry, status: 'done' as const, analysis }
              : entry
          )
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      })
      .catch((error) => {
        console.warn('Photo analysis error:', error);
        setPendingEntries(prev =>
          prev.map(entry =>
            entry.id === pendingId
              ? { ...entry, status: 'error' as const, error: 'Gagal menganalisis foto' }
              : entry
          )
        );
      });
  }, [pendingEntries]);

  const deleteFoodEntry = useCallback((entryId: string) => {
    deleteFoodEntryMutation.mutate(entryId);
  }, [deleteFoodEntryMutation]);

  const updateFoodEntry = useCallback((entryId: string, updates: Omit<FoodEntry, 'id' | 'timestamp'>) => {
    updateFoodEntryMutation.mutate({ entryId, updates });
  }, [updateFoodEntryMutation]);

  const dailyTargets: DailyTargets | null = useMemo(() => {
    if (!profile) {
      console.log('No profile, cannot calculate dailyTargets');
      return null;
    }
    const targets = calculateDailyTargets(profile);
    console.log('Daily targets calculated:', targets);
    return targets;
  }, [profile]);

  const todayEntries = useMemo(() => {
    return foodLog[selectedDate] || [];
  }, [foodLog, selectedDate]);

  const todayTotals = useMemo(() => {
    return todayEntries.reduce(
      (acc, entry) => ({
        calories: acc.calories + entry.calories,
        protein: acc.protein + entry.protein,
        carbs: acc.carbs + entry.carbs,
        fat: acc.fat + entry.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [todayEntries]);

  const clearAllData = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      setProfile(null);
      setFoodLog({});
      setWeightHistory([]);
      setStreakData({
        currentStreak: 0,
        bestStreak: 0,
        lastLoggedDate: '',
        graceUsedThisWeek: false,
      });
      setFavorites([]);
      setRecentMeals([]);
      queryClient.clear();
      console.log('All data cleared');
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  }, [queryClient]);

  return {
    profile,
    saveProfile,
    dailyTargets,
    todayEntries,
    todayTotals,
    foodLog,
    weightHistory,
    addFoodEntry,
    updateFoodEntry,
    deleteFoodEntry,
    streakData,
    selectedDate,
    setSelectedDate,
    pendingEntries,
    addPendingEntry,
    confirmPendingEntry,
    removePendingEntry,
    retryPendingEntry,
    favorites,
    recentMeals,
    addToFavorites,
    removeFromFavorites,
    updateFavorite,
    reorderFavorites,
    isFavorite,
    logFromFavorite,
    logFromRecent,
    removeFromRecent,
    shouldSuggestFavorite,
    addWaterCup,
    removeWaterCup,
    getTodayWaterCups,
    waterCups,
    addSugarUnit,
    removeSugarUnit,
    getTodaySugarUnits,
    sugarUnits,
    addFiberUnit,
    removeFiberUnit,
    getTodayFiberUnits,
    fiberUnits,
    addSodiumUnit,
    removeSodiumUnit,
    getTodaySodiumUnits,
    sodiumUnits,
    addWeightEntry,
    authState,
    signIn,
    signUp,
    signOut,
    updateWeightEntry,
    deleteWeightEntry,
    clearAllData,
    isLoading: profileQuery.isLoading || foodEntriesQuery.isLoading || weightHistoryQuery.isLoading || streakQuery.isLoading || favoritesQuery.isLoading || recentMealsQuery.isLoading || waterQuery.isLoading || sugarQuery.isLoading || fiberQuery.isLoading || sodiumQuery.isLoading,
    isSaving: saveProfileMutation.isPending || saveFoodEntryMutation.isPending || saveWeightHistoryMutation.isPending || saveFavoritesMutation.isPending || saveRecentMealsMutation.isPending,
  };
});

export function useTodayProgress() {
  const { dailyTargets, todayTotals } = useNutrition();

  return useMemo(() => {
    if (!dailyTargets) return null;

    const caloriesRemaining = dailyTargets.calories - todayTotals.calories;
    const proteinRemaining = dailyTargets.protein - todayTotals.protein;
    const caloriesProgress = (todayTotals.calories / dailyTargets.calories) * 100;
    const proteinProgress = (todayTotals.protein / dailyTargets.protein) * 100;

    const isOnTrack = caloriesRemaining >= 0 && caloriesRemaining < dailyTargets.calories * 0.2;
    const isOver = caloriesRemaining < 0;
    const strongProtein = proteinProgress >= 90;

    return {
      caloriesRemaining,
      proteinRemaining,
      caloriesProgress,
      proteinProgress,
      isOnTrack,
      isOver,
      strongProtein,
    };
  }, [dailyTargets, todayTotals]);
}
