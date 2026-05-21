import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDefaultTranslationLanguage,
  setDefaultTranslationLanguage,
} from './translationPreferences';

describe('translationPreferences', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('returns fallback language when no preference is saved', async () => {
    expect(await getDefaultTranslationLanguage()).toBe('Spanish');
  });

  it('persists and returns normalized language preference', async () => {
    await setDefaultTranslationLanguage('english');
    expect(await getDefaultTranslationLanguage()).toBe('English');
  });
});
