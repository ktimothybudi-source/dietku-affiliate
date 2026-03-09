import React from 'react';
import { Stack, router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View style={styles.container}>
        <Text style={styles.eyebrow}>404</Text>
        <Text style={styles.title}>Page not found</Text>
        <Text style={styles.description}>
          The screen you opened does not exist or is no longer available.
        </Text>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.replace('/onboarding')}
          style={styles.button}
          testID="not-found-button"
        >
          <Text style={styles.buttonText}>Go to home</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: '#38BDF8',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 10,
  },
  description: {
    color: '#CBD5E1',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#38BDF8',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buttonText: {
    color: '#082F49',
    fontSize: 15,
    fontWeight: '800',
  },
});
