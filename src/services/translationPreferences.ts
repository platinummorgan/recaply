import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_TRANSLATION_LANGUAGE_KEY = '@recaply_default_translation_language';
const FALLBACK_TRANSLATION_LANGUAGE = 'Spanish';

export const TRANSLATION_LANGUAGE_OPTIONS = [
  'English',
  'Spanish',
  'French',
  'Portuguese',
  'German',
  'Japanese',
  'Korean',
  'Hindi',
  'Arabic',
] as const;

export function normalizeTranslationLanguage(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return FALLBACK_TRANSLATION_LANGUAGE;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export async function getDefaultTranslationLanguage(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(DEFAULT_TRANSLATION_LANGUAGE_KEY);
    if (!raw) {
      return FALLBACK_TRANSLATION_LANGUAGE;
    }
    return normalizeTranslationLanguage(raw);
  } catch {
    return FALLBACK_TRANSLATION_LANGUAGE;
  }
}

export async function setDefaultTranslationLanguage(language: string): Promise<string> {
  const normalized = normalizeTranslationLanguage(language);
  await AsyncStorage.setItem(DEFAULT_TRANSLATION_LANGUAGE_KEY, normalized);
  return normalized;
}
