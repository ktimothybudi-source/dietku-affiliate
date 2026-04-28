import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useLanguage, Language } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import * as Haptics from 'expo-haptics';

export default function LanguagePickerScreen() {
  const { language, setLanguage, t } = useLanguage();
  const { theme } = useTheme();

  const handleLanguageSelect = (lang: Language) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLanguage(lang);
    setTimeout(() => {
      router.back();
    }, 100);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t.languagePicker.title,
          headerStyle: {
            backgroundColor: theme.background,
          },
          headerTintColor: theme.text,
          headerShadowVisible: false,
        }}
      />

      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.content}>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t.languagePicker.subtitle}
          </Text>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.option, language === 'id' && styles.selectedOption]}
              onPress={() => handleLanguageSelect('id')}
              activeOpacity={0.7}
            >
              <View style={styles.optionLeft}>
                <Text style={[styles.flag, { fontSize: 32 }]}>🇮🇩</Text>
                <View>
                  <Text style={[styles.languageName, { color: theme.text }]}>{t.languagePicker.indonesiaName}</Text>
                  <Text style={[styles.languageNative, { color: theme.textSecondary }]}>{t.languagePicker.indonesiaNative}</Text>
                </View>
              </View>
              {language === 'id' && (
                <View style={[styles.checkCircle, { backgroundColor: theme.primary }]}>
                  <Check size={18} color="#FFFFFF" strokeWidth={3} />
                </View>
              )}
            </TouchableOpacity>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <TouchableOpacity
              style={[styles.option, language === 'en' && styles.selectedOption]}
              onPress={() => handleLanguageSelect('en')}
              activeOpacity={0.7}
            >
              <View style={styles.optionLeft}>
                <Text style={[styles.flag, { fontSize: 32 }]}>🇺🇸</Text>
                <View>
                  <Text style={[styles.languageName, { color: theme.text }]}>{t.languagePicker.englishName}</Text>
                  <Text style={[styles.languageNative, { color: theme.textSecondary }]}>{t.languagePicker.englishNative}</Text>
                </View>
              </View>
              {language === 'en' && (
                <View style={[styles.checkCircle, { backgroundColor: theme.primary }]}>
                  <Check size={18} color="#FFFFFF" strokeWidth={3} />
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 24,
    lineHeight: 22,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  selectedOption: {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  flag: {
    fontSize: 32,
  },
  languageName: {
    fontSize: 17,
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  languageNative: {
    fontSize: 14,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    marginLeft: 76,
  },
});
