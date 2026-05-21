export interface TranslationUsageSummary {
  translatedRecordingCount: number;
  totalLanguageVariants: number;
  topLanguages: { language: string; count: number }[];
  latestTranslationAt: string | null;
}

function normalizeLanguageKey(value: string): string {
  return value.trim().toLowerCase().slice(0, 60);
}

function normalizeLanguageLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function parseTranslationCache(value: unknown): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

export function getRecordingTranslationLanguages(recording: any): string[] {
  const raw = recording?.translation_cache_json || recording?.translationCacheJson;
  const parsed = parseTranslationCache(raw);
  if (!parsed) {
    return [];
  }

  const unique = new Map<string, string>();
  Object.entries(parsed).forEach(([fallbackLanguage, entry]) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return;
    }
    const normalized = entry as Record<string, unknown>;
    const sourceLabel = typeof normalized.targetLanguage === 'string'
      ? normalized.targetLanguage
      : String(fallbackLanguage);
    const label = normalizeLanguageLabel(sourceLabel);
    if (!label) {
      return;
    }
    unique.set(normalizeLanguageKey(label), label);
  });

  return Array.from(unique.values());
}

export function summarizeTranslationUsage(recordings: any[]): TranslationUsageSummary {
  const languageTotals = new Map<string, { language: string; count: number }>();
  let translatedRecordingCount = 0;
  let latestTranslationAt: string | null = null;

  recordings.forEach((recording) => {
    const raw = recording?.translation_cache_json || recording?.translationCacheJson;
    const parsed = parseTranslationCache(raw);
    if (!parsed) {
      return;
    }

    const seenThisRecording = new Set<string>();
    let hasTranslation = false;

    Object.entries(parsed).forEach(([fallbackLanguage, entry]) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return;
      }

      const normalized = entry as Record<string, unknown>;
      const sourceLabel = typeof normalized.targetLanguage === 'string'
        ? normalized.targetLanguage
        : String(fallbackLanguage);
      const label = normalizeLanguageLabel(sourceLabel);
      if (!label) {
        return;
      }
      hasTranslation = true;

      const key = normalizeLanguageKey(label);
      if (!seenThisRecording.has(key)) {
        seenThisRecording.add(key);
        const current = languageTotals.get(key);
        languageTotals.set(key, {
          language: label,
          count: (current?.count || 0) + 1,
        });
      }

      const updatedAt = typeof normalized.updatedAt === 'string' ? normalized.updatedAt : null;
      if (updatedAt) {
        if (!latestTranslationAt || updatedAt > latestTranslationAt) {
          latestTranslationAt = updatedAt;
        }
      }
    });

    if (hasTranslation) {
      translatedRecordingCount += 1;
    }
  });

  const topLanguages = Array.from(languageTotals.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    translatedRecordingCount,
    totalLanguageVariants: languageTotals.size,
    topLanguages,
    latestTranslationAt,
  };
}
