import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { useNutrition } from '@/contexts/NutritionContext';

export default function AppEntryScreen() {
  const { authState, authInitialized } = useNutrition();

  useEffect(() => {
    if (!authInitialized) return;
    if (authState.isSignedIn) {
      router.replace('/(tabs)');
      return;
    }
    router.replace('/onboarding');
  }, [authInitialized, authState.isSignedIn]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F6F4F1',
      }}
    >
      <ActivityIndicator size="large" color="#22C55E" />
    </View>
  );
}
