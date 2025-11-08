import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert} from 'react-native';
import {useRoute, RouteProp} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import {RootStackParamList} from '../navigation/AppNavigator';
import {getRecordingById} from '../services/StorageService';

type ExportScreenRoute = RouteProp<RootStackParamList, 'Export'>;

const ExportScreen = () => {
  const route = useRoute<ExportScreenRoute>();
  const {recordingId} = route.params;

  const [recording, setRecording] = useState<any>(null);
  const [exportFormat, setExportFormat] = useState<'text' | 'markdown' | 'pdf'>('text');

  useEffect(() => {
    loadRecording();
  }, []);

  const loadRecording = async () => {
    const rec = await getRecordingById(recordingId);
    if (rec) {
      setRecording(rec);
    }
  };

  const formatContent = () => {
    if (!recording) return '';

    const summary = recording.summary ? JSON.parse(recording.summary) : null;

    if (exportFormat === 'markdown') {
      let content = `# ${recording.name}\n\n`;
      content += `**Date:** ${recording.date}\n\n`;
      content += `## Transcript\n\n${recording.transcript || 'No transcript available'}\n\n`;

      if (summary) {
        content += `## Summary\n\n`;
        content += `### Key Points\n\n`;
        summary.keyPoints?.forEach((point: string) => {
          content += `- ${point}\n`;
        });
        content += `\n### Decisions Made\n\n`;
        summary.decisions?.forEach((decision: string) => {
          content += `- ${decision}\n`;
        });
        content += `\n### Action Items\n\n`;
        summary.actionItems?.forEach((item: string) => {
          content += `- [ ] ${item}\n`;
        });
      }

      return content;
    } else {
      // Plain text format
      let content = `${recording.name}\n`;
      content += `Date: ${recording.date}\n\n`;
      content += `TRANSCRIPT\n${'-'.repeat(50)}\n`;
      content += `${recording.transcript || 'No transcript available'}\n\n`;

      if (summary) {
        content += `SUMMARY\n${'-'.repeat(50)}\n\n`;
        content += `Key Points:\n`;
        summary.keyPoints?.forEach((point: string, idx: number) => {
          content += `${idx + 1}. ${point}\n`;
        });
        content += `\nDecisions Made:\n`;
        summary.decisions?.forEach((decision: string, idx: number) => {
          content += `${idx + 1}. ${decision}\n`;
        });
        content += `\nAction Items:\n`;
        summary.actionItems?.forEach((item: string, idx: number) => {
          content += `${idx + 1}. ${item}\n`;
        });
      }

      return content;
    }
  };

  const shareContent = async (platform?: 'email' | 'general') => {
    const content = formatContent();
    const fileName = `${recording?.name || 'meeting-notes'}.txt`;
    const fileUri = FileSystem.documentDirectory + fileName;

    try {
      // Write content to a file
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      // Check if sharing is available
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/plain',
          dialogTitle: `Meeting Notes: ${recording?.name}`,
          UTI: 'public.plain-text',
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (error: any) {
      console.error('Share error:', error);
      Alert.alert('Error', 'Failed to share content');
    }
  };

  const shareToGmail = () => shareContent('email');
  const shareToNotion = () => {
    Alert.alert(
      'Notion Integration',
      'Notion integration coming soon! For now, you can copy and paste the content.',
    );
  };
  const shareToGoogleDrive = () => {
    Alert.alert(
      'Google Drive Integration',
      'Drive integration coming soon! For now, you can share via other methods.',
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.preview}>
        <Text style={styles.previewTitle}>Preview</Text>
        <View style={styles.previewContent}>
          <Text style={styles.previewText}>{formatContent()}</Text>
        </View>

        <Text style={styles.sectionTitle}>Export Format</Text>
        <View style={styles.formatOptions}>
          <TouchableOpacity
            style={[styles.formatButton, exportFormat === 'text' && styles.formatButtonActive]}
            onPress={() => setExportFormat('text')}>
            <Icon
              name="description"
              size={24}
              color={exportFormat === 'text' ? '#fff' : '#6366f1'}
            />
            <Text
              style={[
                styles.formatButtonText,
                exportFormat === 'text' && styles.formatButtonTextActive,
              ]}>
              Plain Text
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.formatButton, exportFormat === 'markdown' && styles.formatButtonActive]}
            onPress={() => setExportFormat('markdown')}>
            <Icon name="code" size={24} color={exportFormat === 'markdown' ? '#fff' : '#6366f1'} />
            <Text
              style={[
                styles.formatButtonText,
                exportFormat === 'markdown' && styles.formatButtonTextActive,
              ]}>
              Markdown
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <Text style={styles.actionsTitle}>Share To</Text>

        <View style={styles.shareButtons}>
          <TouchableOpacity style={styles.shareButton} onPress={shareToGmail}>
            <Icon name="email" size={32} color="#ea4335" />
            <Text style={styles.shareButtonText}>Gmail</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.shareButton} onPress={shareToGoogleDrive}>
            <Icon name="cloud" size={32} color="#4285f4" />
            <Text style={styles.shareButtonText}>Drive</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.shareButton} onPress={shareToNotion}>
            <Icon name="note" size={32} color="#000" />
            <Text style={styles.shareButtonText}>Notion</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.shareButton} onPress={() => shareContent('general')}>
            <Icon name="share" size={32} color="#6366f1" />
            <Text style={styles.shareButtonText}>More</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  preview: {
    flex: 1,
    padding: 20,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
  },
  previewContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    maxHeight: 300,
  },
  previewText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    fontFamily: 'monospace',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
    marginTop: 10,
  },
  formatOptions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  formatButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#6366f1',
    gap: 8,
  },
  formatButtonActive: {
    backgroundColor: '#6366f1',
  },
  formatButtonText: {
    color: '#6366f1',
    fontSize: 14,
    fontWeight: '600',
  },
  formatButtonTextActive: {
    color: '#fff',
  },
  actions: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  actionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 15,
  },
  shareButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  shareButton: {
    alignItems: 'center',
    padding: 10,
  },
  shareButtonText: {
    marginTop: 8,
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
});

export default ExportScreen;
