import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import { colors, radii, spacing } from '../theme/tokens';
import {
  LLM_PROVIDERS,
  getLLMConfig,
  saveLLMConfig,
  validateApiKey,
  LLMConfig,
} from '../services/LLMConfigService';
import {testLLMConnection} from '../services/LLMService';
import {configToProvider} from '../services/LLMConfigService';

export const LLMSettingsScreen: React.FC = () => {
  const [config, setConfig] = useState<LLMConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const savedConfig = await getLLMConfig();
      setConfig(savedConfig);
    } catch {
      Alert.alert('Error', 'Failed to load LLM configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    const provider = config.provider;
    const providerInfo = LLM_PROVIDERS[provider];

    if (providerInfo.requiresKey && !validateApiKey(provider, config.apiKey)) {
      Alert.alert('Invalid API Key', `Please enter a valid ${providerInfo.displayName} API key`);
      return;
    }

    try {
      await saveLLMConfig(config);
      Alert.alert('Success', 'LLM configuration saved successfully');
    } catch {
      Alert.alert('Error', 'Failed to save configuration');
    }
  };

  const handleTest = async () => {
    if (!config) return;

    setTesting(true);
    try {
      const provider = configToProvider(config);
      const success = await testLLMConnection(provider);

      if (success) {
        Alert.alert('Success', 'LLM connection test passed! ✅');
      } else {
        Alert.alert('Failed', 'LLM connection test failed. Please check your configuration.');
      }
    } catch {
      Alert.alert('Error', 'Connection test failed. Please verify your API key and URL.');
    } finally {
      setTesting(false);
    }
  };

  const updateConfig = (updates: Partial<LLMConfig>) => {
    if (config) {
      setConfig({...config, ...updates});
    }
  };

  const handleProviderChange = (provider: keyof typeof LLM_PROVIDERS) => {
    const providerInfo = LLM_PROVIDERS[provider];
    updateConfig({
      provider,
      apiUrl: providerInfo.apiUrl,
      model: providerInfo.models[0],
    });
  };

  if (loading || !config) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const currentProvider = LLM_PROVIDERS[config.provider];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>LLM Settings</Text>
        <Text style={styles.heroSubtitle}>Choose provider, model, and API behavior for summaries.</Text>
        <View style={styles.heroMetaRow}>
          <Text style={styles.heroMetaLabel}>Current Provider</Text>
          <View style={styles.providerBadge}>
            <Text style={styles.providerBadgeText}>{currentProvider.displayName}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>LLM Provider</Text>
        <Text style={styles.description}>
          Choose the AI provider for generating meeting summaries
        </Text>

        <Text style={styles.label}>Provider</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={config.provider}
            onValueChange={handleProviderChange}
            style={styles.picker}>
            {Object.entries(LLM_PROVIDERS).map(([key, provider]) => (
              <Picker.Item
                key={key}
                label={provider.displayName}
                value={key}
              />
            ))}
          </Picker>
        </View>

        <Text style={styles.label}>Model</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={config.model}
            onValueChange={value => updateConfig({model: value})}
            style={styles.picker}>
            {currentProvider.models.map(model => (
              <Picker.Item key={model} label={model} value={model} />
            ))}
          </Picker>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>API Configuration</Text>

        {currentProvider.requiresKey && (
          <>
            <Text style={styles.label}>API Key</Text>
            <TextInput
              style={styles.input}
              value={config.apiKey}
              onChangeText={text => updateConfig({apiKey: text})}
              placeholder="Enter your API key"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Your API key is stored securely on your device
            </Text>
          </>
        )}

        <Text style={styles.label}>API URL</Text>
        <TextInput
          style={styles.input}
          value={config.apiUrl}
          onChangeText={text => updateConfig({apiUrl: text})}
          placeholder="API endpoint URL"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Advanced Settings</Text>

        <Text style={styles.label}>Temperature: {config.temperature.toFixed(1)}</Text>
        <View style={styles.sliderContainer}>
          <Text style={styles.sliderLabel}>0.0 (Focused)</Text>
          <Text style={styles.sliderLabel}>1.0 (Creative)</Text>
        </View>
        <Text style={styles.hint}>
          Lower values make output more focused and deterministic
        </Text>

        <Text style={styles.label}>Max Tokens</Text>
        <TextInput
          style={styles.input}
          value={config.maxTokens.toString()}
          onChangeText={text => updateConfig({maxTokens: parseInt(text) || 2000})}
          keyboardType="numeric"
          placeholder="2000"
        />
        <Text style={styles.hint}>Maximum length of the generated summary</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.testButton]}
          onPress={handleTest}
          disabled={testing}>
          {testing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Test Connection</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>Save Configuration</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>💡 Getting API Keys</Text>
        <Text style={styles.infoText}>
          • OpenAI: https://platform.openai.com/api-keys{'\n'}
          • Anthropic: https://console.anthropic.com/settings/keys{'\n'}
          • Groq: https://console.groq.com/keys{'\n'}
          • Local: No key required for local LLMs
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroCard: {
    backgroundColor: colors.surfaceDark,
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.textOnDark,
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textOnDarkMuted,
    marginBottom: spacing.sm,
  },
  heroMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroMetaLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '700',
  },
  providerBadge: {
    backgroundColor: colors.accentStrong,
    borderWidth: 1,
    borderColor: colors.accentDark,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  providerBadgeText: {
    fontSize: 11,
    color: colors.surface,
    fontWeight: '700',
  },
  section: {
    backgroundColor: colors.surface,
    marginTop: spacing.sm,
    marginHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 15,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.sm,
    padding: 12,
    fontSize: 16,
    backgroundColor: colors.surface,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 5,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  picker: {
    height: 50,
  },
  sliderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  sliderLabel: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  buttonContainer: {
    padding: spacing.lg,
  },
  button: {
    backgroundColor: colors.accent,
    padding: 15,
    borderRadius: radii.sm,
    alignItems: 'center',
    marginBottom: 12,
  },
  testButton: {
    backgroundColor: colors.success,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: colors.accentInfoSoft,
    marginHorizontal: spacing.lg,
    marginTop: 0,
    marginBottom: spacing.lg,
    padding: 15,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accentInfoText,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.accentInfoText,
    lineHeight: 20,
  },
});
