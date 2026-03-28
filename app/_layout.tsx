// template
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { NutritionProvider } from "@/contexts/NutritionContext";
import { ExerciseProvider } from "@/contexts/ExerciseContext";
import { CommunityProvider } from "@/contexts/CommunityContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import PremiumPaywallModal from "@/components/PremiumPaywallModal";
import { trpc, trpcClient } from "@/lib/trpc";

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="food-search" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="log-exercise" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="setup-community-profile" options={{ presentation: 'card' }} />
      <Stack.Screen name="create-post" options={{ presentation: 'card' }} />
      <Stack.Screen name="post-detail" options={{ presentation: 'card' }} />
      <Stack.Screen name="create-group" options={{ presentation: 'card' }} />
      <Stack.Screen name="browse-groups" options={{ presentation: 'card' }} />
      <Stack.Screen name="group-settings" options={{ presentation: 'card' }} />
      <Stack.Screen name="story-share" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="camera-scan" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="language-picker" options={{ presentation: 'card' }} />
      <Stack.Screen name="edit-profile" options={{ presentation: 'card' }} />
      <Stack.Screen name="legal-terms" options={{ presentation: 'card' }} />
      <Stack.Screen name="legal-privacy" options={{ presentation: 'card' }} />
      <Stack.Screen name="legal-restore-purchase" options={{ presentation: 'card' }} />
      <Stack.Screen name="playstore-checklist" options={{ presentation: 'card' }} />
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ThemeProvider>
            <NotificationProvider>
              <NutritionProvider>
                <SubscriptionProvider>
                  <ExerciseProvider>
                    <CommunityProvider>
                      <GestureHandlerRootView>
                        <RootLayoutNav />
                        <PremiumPaywallModal />
                      </GestureHandlerRootView>
                    </CommunityProvider>
                  </ExerciseProvider>
                </SubscriptionProvider>
              </NutritionProvider>
            </NotificationProvider>
          </ThemeProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
