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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const currentProvider = LLM_PROVIDERS[config.provider];

  return (
    <ScrollView style={styles.container}>
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
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    backgroundColor: 'white',
    marginTop: 20,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 15,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
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
    color: '#666',
  },
  buttonContainer: {
    padding: 20,
  },
  button: {
    backgroundColor: '#6366f1',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  testButton: {
    backgroundColor: '#10b981',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#eff6ff',
    margin: 20,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
});
