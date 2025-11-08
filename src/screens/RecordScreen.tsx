import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { Paths, File } from 'expo-file-system';
import { addToQueue } from '../services/storage';
import { checkUploadStatus, processQueue } from '../services/uploadQueue';
import { useAuth } from '../context/AuthContext';

const API_URL = 'https://web-production-abd11.up.railway.app';

export default function RecordScreen({ navigation }: any) {
  const { user, token, refreshUser } = useAuth();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingSegments, setRecordingSegments] = useState<string[]>([]);
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [currentDuration, setCurrentDuration] = useState<number>(0);

  // Timer to update duration display
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        const elapsed = (Date.now() - recordingStartTime) / 1000;
        setCurrentDuration(totalDuration + elapsed);
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, isPaused, recordingStartTime, totalDuration]);

  async function checkMinutesAvailable(): Promise<boolean> {
    if (!user) return false;

    // Pro users have unlimited minutes
    if (user.subscriptionTier === 'pro') {
      return true;
    }

    const minutesUsed = user.minutesUsed || 0;
    const minutesLimit = user.minutesLimit || 30;

    if (minutesUsed >= minutesLimit) {
      Alert.alert(
        'Minutes Limit Reached',
        `You've used all ${minutesLimit} minutes on your ${user.subscriptionTier.toUpperCase()} plan.\n\nUpgrade to continue recording!`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Upgrade',
            onPress: () => navigation.navigate('Subscription'),
          },
        ]
      );
      return false;
    }

    // Warn if close to limit (90% or more used)
    const percentUsed = (minutesUsed / minutesLimit) * 100;
    if (percentUsed >= 90) {
      const minutesRemaining = minutesLimit - minutesUsed;
      Alert.alert(
        'Low Minutes',
        `You have ${minutesRemaining.toFixed(1)} minutes remaining on your ${user.subscriptionTier.toUpperCase()} plan.`,
        [{ text: 'OK' }]
      );
    }

    return true;
  }

  async function startRecording() {
    try {
      // Check if user has available minutes
      const hasMinutes = await checkMinutesAvailable();
      if (!hasMinutes) {
        return;
      }

      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission denied', 'Please allow microphone access');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingStartTime(Date.now());
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Could not start recording');
    }
  }

  async function pauseRecording() {
    if (!recording) return;

    try {
      await recording.pauseAsync();
      const uri = recording.getURI();
      
      // Calculate duration of this segment
      const segmentDuration = (Date.now() - recordingStartTime) / 1000;
      setTotalDuration(prev => prev + segmentDuration);
      
      if (uri) {
        setRecordingSegments(prev => [...prev, uri]);
      }
      
      setIsPaused(true);
    } catch (err) {
      console.error('Failed to pause recording', err);
      Alert.alert('Error', 'Could not pause recording');
    }
  }

  async function resumeRecording() {
    if (!recording) return;

    try {
      // Stop current recording and save its URI
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (uri) {
        setRecordingSegments(prev => [...prev, uri]);
      }

      // Start a new recording
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsPaused(false);
      setRecordingStartTime(Date.now());
    } catch (err) {
      console.error('Failed to resume recording', err);
      Alert.alert('Error', 'Could not resume recording');
    }
  }

  async function stopRecording() {
    if (!recording) return;

    try {
      setIsRecording(false);
      setIsPaused(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      // Add final segment
      let allSegments = [...recordingSegments];
      if (uri) {
        allSegments.push(uri);
      }
      
      setRecording(null);
      
      if (allSegments.length > 0) {
        // Pass all segments (or single URI) to handler
        await handleRecordingStopped(allSegments);
      }
      
      // Reset segments and duration and duration
      setRecordingSegments([]);
      setTotalDuration(0);
      setCurrentDuration(0);
    } catch (err) {
      console.error('Failed to stop recording', err);
      Alert.alert('Error', 'Could not stop recording');
    }
  }

  async function combineAudioSegments(segments: string[]): Promise<string[]> {
    // Return all segments - they'll be combined server-side
    console.log(`Preparing ${segments.length} segments for server-side combining...`);
    return segments;
  }

  async function handleRecordingStopped(uriOrSegments: string[] | string) {
    try {
      setIsUploading(true);

      // Check if we can upload now
      const uploadStatus = await checkUploadStatus();

      if (uploadStatus.canUpload) {
        // Upload immediately (either single file or multiple segments)
        console.log('Uploading immediately...');
        await uploadToBackend(uriOrSegments);
      } else {
        // Save to local storage and queue for later
        // For multi-segment, just save the first one for now (offline mode limitation)
        console.log('Queueing for later:', uploadStatus.reason);
        
        const uri = Array.isArray(uriOrSegments) ? uriOrSegments[0] : uriOrSegments;
        
        // Copy to permanent location
        const filename = `recording_${Date.now()}.m4a`;
        const permanentFile = new File(Paths.document, filename);
        
        // Read from source URI and write to permanent location
        const response = await fetch(uri);
        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        const writer = permanentFile.writableStream().getWriter();
        await writer.write(uint8Array);
        await writer.close();
        
        // Add to queue
        await addToQueue(permanentFile.uri, filename);
        
        Alert.alert(
          'Saved for Later',
          `Recording saved locally.\n\n${uploadStatus.reason}\n\nWill upload automatically when conditions are met.`,
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      }
    } catch (err: any) {
      console.error('Error handling recording:', err);
      Alert.alert('Error', `Could not save recording: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  }

  async function uploadToBackend(uriOrSegments: string | string[]) {
    try {
      setIsUploading(true);

      const isMultiSegment = Array.isArray(uriOrSegments) && uriOrSegments.length > 1;
      const endpoint = isMultiSegment ? '/api/audio/upload-segments' : '/api/audio/upload';

      console.log('Uploading to:', `${API_URL}${endpoint}`);
      console.log('Segment count:', isMultiSegment ? uriOrSegments.length : 1);

      // Upload to backend
      const formData = new FormData();
      
      if (isMultiSegment) {
        // Upload multiple segments
        for (let i = 0; i < (uriOrSegments as string[]).length; i++) {
          formData.append('segments', {
            uri: (uriOrSegments as string[])[i],
            type: 'audio/m4a',
            name: `segment_${i}.m4a`,
          } as any);
        }
      } else {
        // Upload single file
        const uri = Array.isArray(uriOrSegments) ? uriOrSegments[0] : uriOrSegments;
        formData.append('audio', {
          uri,
          type: 'audio/m4a',
          name: 'recording.m4a',
        } as any);
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
        },
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Error response:', errorText);
        throw new Error(`Upload failed: ${response.status}`);
      }

      const text = await response.text();
      console.log('Response text length:', text.length);
      
      const data = JSON.parse(text);
      console.log('Transcription received:', data.transcription?.substring(0, 50));
      
      // Refresh user data to get updated minutes
      await refreshUser();
      
      if (data.transcription) {
        // Navigate to transcript screen instead of alert
        navigation.replace('Transcript', {
          transcription: data.transcription,
          filename: 'recording.m4a',
          recordingId: data.recordingId,
          audioUrl: data.audioUrl,
        });
      } else {
        Alert.alert('Success', 'Audio uploaded but no transcription returned');
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      Alert.alert(
        'Upload Error', 
        `Could not complete request.\n\nError: ${err.message}\n\nBackend: ${API_URL}`
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🎙️ Record Audio</Text>
      
      <View style={styles.recordingArea}>
        {isUploading ? (
          <>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.statusText}>Uploading & Transcribing...</Text>
          </>
        ) : isRecording ? (
          <>
            <View style={[styles.recordingIndicator, isPaused ? styles.paused : styles.recording]} />
            <Text style={styles.statusText}>
              {isPaused ? 'Paused' : 'Recording...'}
            </Text>
            <Text style={styles.durationText}>
              {Math.floor(currentDuration / 60)}:{String(Math.floor(currentDuration % 60)).padStart(2, '0')}
            </Text>
          </>
        ) : (
          <>
            <View style={styles.recordingIndicator} />
            <Text style={styles.statusText}>Ready to record</Text>
          </>
        )}
      </View>

      {isRecording && !isUploading && (
        <TouchableOpacity
          style={[styles.button, styles.pauseButton]}
          onPress={isPaused ? resumeRecording : pauseRecording}
        >
          <Text style={styles.buttonText}>
            {isPaused ? '▶️ Resume' : '⏸️ Pause'}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.button, isRecording && styles.stopButton]}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={isUploading}
      >
        <Text style={styles.buttonText}>
          {isRecording ? '⏹️ Stop Recording' : '⏺️ Start Recording'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        disabled={isRecording || isUploading}
      >
        <Text style={[styles.backButtonText, (isRecording || isUploading) && styles.disabledText]}>
          ← Back to Home
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 60,
  },
  recordingArea: {
    alignItems: 'center',
    marginBottom: 60,
  },
  recordingIndicator: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ddd',
    marginBottom: 20,
  },
  recording: {
    backgroundColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  paused: {
    backgroundColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 8,
  },
  statusText: {
    fontSize: 18,
    color: '#666',
  },
  durationText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 40,
    marginBottom: 20,
  },
  stopButton: {
    backgroundColor: '#ef4444',
  },
  pauseButton: {
    backgroundColor: '#f59e0b',
  },
  buttonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  },
  backButton: {
    padding: 16,
  },
  backButtonText: {
    color: '#6366f1',
    fontSize: 16,
  },
  disabledText: {
    color: '#ccc',
  },
});
