import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, ActionSheetIOS, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Paths, File, Directory } from 'expo-file-system';
import { Audio } from 'expo-av';
import { useAuth } from '../context/AuthContext';

const API_URL = 'https://web-production-abd11.up.railway.app';

export default function TranscriptScreen({ route, navigation }: any) {
  const { token } = useAuth();
  const { transcription, filename, recordingId, audioUrl } = route.params;
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrlFromDB, setAudioUrlFromDB] = useState<string | null>(audioUrl || null);

  // Load existing summary if available
  React.useEffect(() => {
    if (recordingId) {
      loadRecording();
    }
    
    // Cleanup audio on unmount
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [recordingId]);

  async function loadRecording() {
    try {
      const response = await fetch(`${API_URL}/api/audio/recordings/${recordingId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const recording = await response.json();
        if (recording.summary_json) {
          setSummary(recording.summary_json);
        }
        if (recording.audio_url) {
          setAudioUrlFromDB(recording.audio_url);
        }
      }
    } catch (error) {
      console.error('Error loading recording:', error);
    }
  }

  async function playAudio() {
    try {
      if (!audioUrlFromDB) {
        Alert.alert('No Audio', 'Audio file not available for this recording');
        return;
      }

      if (isPlaying && sound) {
        // Pause
        await sound.pauseAsync();
        setIsPlaying(false);
      } else if (sound) {
        // Resume
        await sound.playAsync();
        setIsPlaying(true);
      } else {
        // Load and play
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: audioUrlFromDB },
          { shouldPlay: true },
          (status) => {
            if (status.isLoaded && status.didJustFinish) {
              setIsPlaying(false);
            }
          }
        );
        setSound(newSound);
        setIsPlaying(true);
      }
    } catch (error: any) {
      console.error('Error playing audio:', error);
      Alert.alert('Playback Error', error.message);
    }
  }

  async function generateSummary() {
    try {
      setLoading(true);
      console.log('Generating summary...');

      const response = await fetch(`${API_URL}/api/audio/summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          transcript: transcription,
          recordingId: recordingId 
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('Summary received:', data);
      setSummary(data);
    } catch (err: any) {
      console.error('Summary error:', err);
      Alert.alert('Error', `Could not generate summary: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function deleteRecording() {
    Alert.alert(
      'Delete Recording',
      'Are you sure you want to delete this recording? This is permanent and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/audio/recordings/${recordingId}`, {
                method: 'DELETE',
              });

              if (response.ok) {
                Alert.alert('Deleted', 'Recording deleted successfully');
                navigation.navigate('Home');
              } else {
                Alert.alert('Error', 'Could not delete recording');
              }
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert('Error', 'Could not delete recording');
            }
          },
        },
      ]
    );
  }

  async function exportTranscript() {
    // Show options
    Alert.alert(
      'Export Transcript',
      'Choose export method:',
      [
        {
          text: 'Save to Downloads',
          onPress: saveToDownloads,
        },
        {
          text: 'Copy to Clipboard',
          onPress: copyToClipboard,
        },
        {
          text: 'Share/Save File',
          onPress: shareFile,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  }

  async function saveToDownloads() {
    try {
      console.log('Saving to public Downloads folder...');
      
      // Create text content
      let content = `Recording: ${filename}\n`;
      content += `Date: ${new Date().toLocaleString()}\n\n`;
      content += `=== TRANSCRIPT ===\n\n${transcription}\n\n`;
      
      if (summary) {
        content += `=== SUMMARY ===\n\n${summary.summary}\n\n`;
        
        if (summary.actionItems && summary.actionItems.length > 0) {
          content += `=== ACTION ITEMS ===\n\n`;
          summary.actionItems.forEach((item: any, index: number) => {
            const task = typeof item === 'string' ? item : item.task;
            content += `${index + 1}. ${task}\n`;
          });
          content += '\n';
        }
        
        if (summary.keyPoints && summary.keyPoints.length > 0) {
          content += `=== KEY POINTS ===\n\n`;
          summary.keyPoints.forEach((point: string, index: number) => {
            content += `${index + 1}. ${point}\n`;
          });
        }
      }

      // Use public Downloads folder directly (Android)
      // This is /storage/emulated/0/Download - accessible via Files app
      const downloadsPath = 'file:///storage/emulated/0/Download';
      const downloadsDir = new Directory(downloadsPath);
      
      console.log('Downloads dir:', downloadsDir.uri);

      // Create file directly in Downloads (no subdirectory)
      const fileName = `${filename.replace('.m4a', '')}_transcript_${Date.now()}.txt`;
      const file = new File(downloadsDir, fileName);
      
      console.log('Saving to:', file.uri);
      
      // Write using writable stream
      const writer = file.writableStream().getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(content));
      await writer.close();
      
      console.log('File saved! Size:', file.size, 'bytes');
      
      Alert.alert(
        'Saved to Downloads!', 
        `File: ${fileName}\n\nLocation: Downloads folder\n\nOpen your Files app to view it.`
      );
    } catch (error: any) {
      console.error('Save error:', error);
      Alert.alert('Error', `Could not save to Downloads: ${error.message}\n\nTry "Share/Save File" instead.`);
    }
  }

  async function copyToClipboard() {
    try {
      let content = `Recording: ${filename}\n`;
      content += `Date: ${new Date().toLocaleString()}\n\n`;
      content += `=== TRANSCRIPT ===\n\n${transcription}\n\n`;
      
      if (summary) {
        content += `=== SUMMARY ===\n\n${summary.summary}\n\n`;
        
        if (summary.actionItems && summary.actionItems.length > 0) {
          content += `=== ACTION ITEMS ===\n\n`;
          summary.actionItems.forEach((item: any, index: number) => {
            const task = typeof item === 'string' ? item : item.task;
            content += `${index + 1}. ${task}\n`;
          });
          content += '\n';
        }
        
        if (summary.keyPoints && summary.keyPoints.length > 0) {
          content += `=== KEY POINTS ===\n\n`;
          summary.keyPoints.forEach((point: string, index: number) => {
            content += `${index + 1}. ${point}\n`;
          });
        }
      }

      await Clipboard.setStringAsync(content);
      Alert.alert('Copied!', 'Transcript copied to clipboard. You can paste it into any app or save it to a file.');
    } catch (error: any) {
      console.error('Copy error:', error);
      Alert.alert('Error', `Could not copy to clipboard: ${error.message}`);
    }
  }

  async function shareFile() {
    try {
      console.log('Starting export...');
      
      // Create text content
      let content = `Recording: ${filename}\n`;
      content += `Date: ${new Date().toLocaleString()}\n\n`;
      content += `=== TRANSCRIPT ===\n\n${transcription}\n\n`;
      
      if (summary) {
        content += `=== SUMMARY ===\n\n${summary.summary}\n\n`;
        
        if (summary.actionItems && summary.actionItems.length > 0) {
          content += `=== ACTION ITEMS ===\n\n`;
          summary.actionItems.forEach((item: any, index: number) => {
            const task = typeof item === 'string' ? item : item.task;
            content += `${index + 1}. ${task}\n`;
          });
          content += '\n';
        }
        
        if (summary.keyPoints && summary.keyPoints.length > 0) {
          content += `=== KEY POINTS ===\n\n`;
          summary.keyPoints.forEach((point: string, index: number) => {
            content += `${index + 1}. ${point}\n`;
          });
        }
      }

      // Create file and write content
      const fileName = `${filename.replace('.m4a', '')}_transcript.txt`;
      console.log('Creating file:', fileName);
      const file = new File(Paths.cache, fileName);
      
      console.log('Writing content, length:', content.length);
      // Write using writable stream
      const writer = file.writableStream().getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(content));
      await writer.close();
      
      console.log('File URI:', file.uri);

      // Share file
      const canShare = await Sharing.isAvailableAsync();
      console.log('Can share:', canShare);
      
      if (canShare) {
        console.log('Opening share dialog...');
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/plain',
          dialogTitle: 'Export Transcript',
          UTI: 'public.plain-text',
        });
        console.log('Share completed');
      } else {
        Alert.alert('Not Available', 'Sharing is not available on this device');
      }
    } catch (error: any) {
      console.error('Export error:', error);
      Alert.alert('Error', `Could not export transcript: ${error.message}`);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>📄 Transcript</Text>
        <Text style={styles.filename}>{filename}</Text>
      </View>

      {audioUrlFromDB && (
        <TouchableOpacity 
          style={styles.playButton}
          onPress={playAudio}
        >
          <Text style={styles.playButtonText}>
            {isPlaying ? '⏸️ Pause' : '▶️ Play Recording'}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transcription</Text>
        <View style={styles.card}>
          <Text style={styles.text}>{transcription}</Text>
        </View>
      </View>

      {!summary && (
        <TouchableOpacity 
          style={styles.generateButton}
          onPress={generateSummary}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>✨ Generate AI Summary</Text>
          )}
        </TouchableOpacity>
      )}

      {summary && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Summary</Text>
            <View style={styles.card}>
              <Text style={styles.text}>{summary.summary}</Text>
            </View>
          </View>

          {summary.actionItems && summary.actionItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>✅ Action Items</Text>
              {summary.actionItems.map((item: any, index: number) => (
                <View key={index} style={styles.actionItem}>
                  <Text style={styles.bullet}>•</Text>
                  <View style={styles.actionContent}>
                    <Text style={styles.actionText}>
                      {typeof item === 'string' ? item : item.task}
                    </Text>
                    {typeof item === 'object' && (
                      <View style={styles.actionMetadata}>
                        {item.assignee && item.assignee !== 'self' && (
                          <Text style={styles.metadataText}>👤 {item.assignee}</Text>
                        )}
                        {item.priority && (
                          <Text style={[
                            styles.metadataText,
                            item.priority === 'high' && styles.priorityHigh,
                            item.priority === 'medium' && styles.priorityMedium,
                            item.priority === 'low' && styles.priorityLow,
                          ]}>
                            {item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢'} {item.priority}
                          </Text>
                        )}
                        {item.deadline && (
                          <Text style={styles.metadataText}>📅 {item.deadline}</Text>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {summary.keyPoints && summary.keyPoints.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🎯 Key Points</Text>
              {summary.keyPoints.map((point: string, index: number) => (
                <View key={index} style={styles.actionItem}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.actionText}>{point}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <TouchableOpacity 
        style={styles.doneButton}
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={styles.doneButtonText}>Done</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.exportButton}
        onPress={exportTranscript}
      >
        <Text style={styles.exportButtonText}>📤 Export Transcript</Text>
      </TouchableOpacity>

      {recordingId && (
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={deleteRecording}
        >
          <Text style={styles.deleteButtonText}>🗑️ Delete Recording</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  filename: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  text: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  generateButton: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  playButton: {
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 10,
    backgroundColor: '#10b981',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  playButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  actionItem: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
  },
  bullet: {
    fontSize: 16,
    color: '#6366f1',
    marginRight: 10,
    fontWeight: 'bold',
  },
  actionContent: {
    flex: 1,
  },
  actionText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
  },
  actionMetadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  metadataText: {
    fontSize: 13,
    color: '#666',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  priorityHigh: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  priorityMedium: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  priorityLow: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
  },
  doneButton: {
    marginHorizontal: 20,
    marginTop: 30,
    marginBottom: 10,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  doneButtonText: {
    color: '#6366f1',
    fontSize: 16,
    fontWeight: '600',
  },
  exportButton: {
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  exportButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    marginHorizontal: 20,
    marginBottom: 40,
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  deleteButtonText: {
    color: '#dc2626',
    fontSize: 16,
    fontWeight: '600',
  },
});
