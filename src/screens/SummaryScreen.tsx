import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {useNavigation, useRoute, RouteProp} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {RootStackParamList} from '../navigation/AppNavigator';
import {getRecordingById, updateSummary} from '../services/StorageService';
import {generateSummary} from '../services/AIService';

type SummaryScreenProp = StackNavigationProp<RootStackParamList, 'Summary'>;
type SummaryScreenRoute = RouteProp<RootStackParamList, 'Summary'>;

interface SummaryData {
  keyPoints: string[];
  decisions: string[];
  actionItems: string[];
}

const SummaryScreen = () => {
  const navigation = useNavigation<SummaryScreenProp>();
  const route = useRoute<SummaryScreenRoute>();
  const {recordingId} = route.params;

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [recording, setRecording] = useState<any>(null);

  useEffect(() => {
    loadRecording();
  }, []);

  const loadRecording = async () => {
    const rec = await getRecordingById(recordingId);
    if (rec) {
      setRecording(rec);
      if (rec.summary) {
        setSummary(JSON.parse(rec.summary));
      } else {
        // Auto-generate summary if not exists
        generateMeetingSummary();
      }
    }
  };

  const generateMeetingSummary = async () => {
    if (!recording?.transcript) {
      Alert.alert('No Transcript', 'Please transcribe the audio first');
      return;
    }

    setLoading(true);
    try {
      // Call LLM API for summarization
      const result = await generateSummary(recording.transcript);
      setSummary(result);
      await updateSummary(recordingId, JSON.stringify(result));
    } catch (error) {
      console.error('Summary generation error:', error);
      Alert.alert('Error', 'Failed to generate summary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const proceedToExport = () => {
    navigation.navigate('Export', {recordingId});
  };

  const renderSection = (title: string, icon: string, items: string[], color: string) => {
    if (!items || items.length === 0) return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name={icon} size={24} color={color} />
          <Text style={[styles.sectionTitle, {color}]}>{title}</Text>
        </View>
        {items.map((item, index) => (
          <View key={index} style={styles.item}>
            <View style={[styles.bullet, {backgroundColor: color}]} />
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{recording?.name || 'Recording'}</Text>
        <Text style={styles.subtitle}>AI-Generated Summary</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Generating summary...</Text>
          <Text style={styles.loadingSubtext}>AI is analyzing the transcript</Text>
        </View>
      ) : summary ? (
        <ScrollView style={styles.summaryContainer}>
          {renderSection('Key Points', 'lightbulb', summary.keyPoints, '#f59e0b')}
          {renderSection('Decisions Made', 'check-circle', summary.decisions, '#10b981')}
          {renderSection('Action Items', 'assignment', summary.actionItems, '#6366f1')}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Icon name="summarize" size={80} color="#cbd5e1" />
          <Text style={styles.emptyText}>No summary available</Text>
        </View>
      )}

      <View style={styles.actions}>
        {summary && (
          <>
            <TouchableOpacity style={styles.secondaryButton} onPress={generateMeetingSummary}>
              <Icon name="refresh" size={24} color="#6366f1" />
              <Text style={styles.secondaryButtonText}>Regenerate</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryButton} onPress={proceedToExport}>
              <Text style={styles.primaryButtonText}>Export & Share</Text>
              <Icon name="share" size={24} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748b',
  },
  summaryContainer: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 30,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  item: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingLeft: 8,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: 12,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: '#1e293b',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 20,
    fontSize: 20,
    fontWeight: '600',
    color: '#64748b',
  },
  actions: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 10,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#6366f1',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SummaryScreen;
