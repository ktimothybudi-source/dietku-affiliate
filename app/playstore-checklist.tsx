import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';

type ChecklistSection = {
  title: string;
  items: string[];
};

const SECTIONS: ChecklistSection[] = [
  {
    title: 'Google Play Setup',
    items: [
      'Create a Google Play Console account',
      'Create app entry (name, language, app/game, free/paid)',
      'Enable Play App Signing',
    ],
  },
  {
    title: 'App Config and Identity',
    items: [
      'Set final Android package ID in app.json (android.package)',
      'Set versioning in app.json (version + android.versionCode)',
      'Confirm app name, icon, adaptive icon, and splash',
      'Confirm deep link scheme is final and unique',
    ],
  },
  {
    title: 'Secrets and Environment',
    items: [
      'Set production Supabase URL + anon key',
      'Remove unused env vars and test with production values',
      'Ensure .env is not committed to git',
    ],
  },
  {
    title: 'Supabase Production Readiness',
    items: [
      'Run all migrations on production Supabase',
      'Verify RLS policies (groups, members, posts, chats)',
      'Confirm meal-photos bucket and storage policies',
      'Test signup/signin, group create/join, post photo upload, and chat',
    ],
  },
  {
    title: 'Android Build Readiness',
    items: [
      'Configure EAS and keystore backup',
      'Build Android AAB (not APK) for Play Store',
      'Test release build on real Android device',
    ],
  },
  {
    title: 'Policy and Legal',
    items: [
      'Prepare Privacy Policy URL',
      'Prepare Terms of Service URL (recommended)',
      'Complete Data Safety form in Play Console',
      'Complete Content Rating questionnaire',
    ],
  },
  {
    title: 'Store Listing Assets',
    items: [
      'Short description + full description',
      'High-res icon (512x512)',
      'Feature graphic (1024x500)',
      'At least 2 phone screenshots',
      'Optional promo video',
    ],
  },
  {
    title: 'Permissions and QA',
    items: [
      'Keep only required Android permissions',
      'Confirm photo/media usage messaging in app + policy',
      'Smoke test all main flows before submit',
      'Fix blocking runtime errors',
      'Run lint/typecheck before release',
    ],
  },
  {
    title: 'Release Process',
    items: [
      'Create production release in Play Console',
      'Upload AAB and add release notes',
      'Roll out to Internal testing first',
      'Fix issues, then move to Production rollout',
    ],
  },
];

export default function PlaystoreChecklistScreen() {
  const { theme } = useTheme();

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Play Store Checklist',
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: theme.text }]}>DietKu Deployment Checklist</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Use this page to track everything needed before publishing to Google Play.
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{section.title}</Text>
            {section.items.map((item) => (
              <View key={item} style={styles.itemRow}>
                <Text style={[styles.checkbox, { color: theme.primary }]}>[ ]</Text>
                <Text style={[styles.itemText, { color: theme.textSecondary }]}>{item}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  checkbox: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 1,
  },
  itemText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});
