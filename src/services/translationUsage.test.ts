import {
  getRecordingTranslationLanguages,
  summarizeTranslationUsage,
} from './translationUsage';

describe('translationUsage', () => {
  it('extracts languages from translation cache objects and strings', () => {
    const objectRecording = {
      translation_cache_json: {
        spanish: { targetLanguage: 'Spanish' },
        french: { targetLanguage: 'French' },
      },
    };
    const stringRecording = {
      translation_cache_json: JSON.stringify({
        japanese: { targetLanguage: 'Japanese' },
      }),
    };

    expect(getRecordingTranslationLanguages(objectRecording)).toEqual(['Spanish', 'French']);
    expect(getRecordingTranslationLanguages(stringRecording)).toEqual(['Japanese']);
  });

  it('summarizes translation usage across recordings', () => {
    const summary = summarizeTranslationUsage([
      {
        translation_cache_json: {
          spanish: { targetLanguage: 'Spanish', updatedAt: '2026-04-20T10:00:00.000Z' },
          french: { targetLanguage: 'French', updatedAt: '2026-04-20T10:00:00.000Z' },
        },
      },
      {
        translation_cache_json: {
          spanish: { targetLanguage: 'Spanish', updatedAt: '2026-04-22T11:00:00.000Z' },
        },
      },
      {
        translation_cache_json: null,
      },
    ]);

    expect(summary.translatedRecordingCount).toBe(2);
    expect(summary.totalLanguageVariants).toBe(2);
    expect(summary.latestTranslationAt).toBe('2026-04-22T11:00:00.000Z');
    expect(summary.topLanguages[0]).toEqual({ language: 'Spanish', count: 2 });
  });
});
