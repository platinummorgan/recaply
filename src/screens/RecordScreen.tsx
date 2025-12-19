import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { Audio } from 'expo-av';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { Paths, File } from 'expo-file-system';
import { addToQueue } from '../services/storage';
import { checkUploadStatus, processQueue } from '../services/uploadQueue';
import { useAuth } from '../context/AuthContext';

const API_URL = 'https://web-production-abd11.up.railway.app';

// Recording & Upload Limits:
// - No hard limit on recording duration (limited only by user's available minutes)
// - Backend transcription timeout: 30 minutes (handles recordings up to ~25 minutes reliably)
// - Client upload timeout: 2 hours (handles upload + transcription for very long recordings)
// - File size limit: 500MB (supports 60+ minute recordings)
// - All recordings are saved locally first to prevent data loss on timeout/error
// - Failed uploads are automatically queued for retry

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
  const [notificationId, setNotificationId] = useState<string | null>(null);

  // Set up notification handler
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });

    // Request notification permissions
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Notification permissions not granted');
      }
    })();
  }, []);

  // Timer to update duration display and notification
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused) {
      interval = setInterval(async () => {
        const elapsed = (Date.now() - recordingStartTime) / 1000;
        const newDuration = totalDuration + elapsed;
        setCurrentDuration(newDuration);
        
        // Update notification with current duration
        if (notificationId) {
          await updateRecordingNotification(notificationId, newDuration);
        }
        
        // Warn at 20 minutes about potential upload delays for very long recordings
        const totalMinutes = Math.floor(newDuration / 60);
        if (totalMinutes === 20 && Math.floor((newDuration - 1) / 60) === 19) {
          Alert.alert(
            'Long Recording Notice',
            'You\'ve been recording for 20 minutes. Recordings over 25 minutes may take longer to upload and transcribe. Your recording will be saved locally regardless of upload time.',
            [{ text: 'OK' }]
          );
        }
      }, 1000); // Update every second for notification
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, isPaused, recordingStartTime, totalDuration, notificationId]);

  async function showRecordingNotification(): Promise<string> {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '🎙️ Recording in Progress',
        body: 'Duration: 0:00',
        sound: false,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        sticky: true,
        data: { type: 'recording' },
      },
      trigger: null, // Show immediately
    });
    return notificationId;
  }

  async function updateRecordingNotification(id: string, durationSeconds: number) {
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = Math.floor(durationSeconds % 60);
    const timeString = `${minutes}:${String(seconds).padStart(2, '0')}`;
    
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: '🎙️ Recording in Progress',
        body: `Duration: ${timeString}`,
        sound: false,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        sticky: true,
        data: { type: 'recording' },
      },
      trigger: null,
    });
  }

  async function dismissRecordingNotification(id: string | null) {
    if (id) {
      await Notifications.dismissNotificationAsync(id);
    }
  }

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
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingStartTime(Date.now());
      
      // Keep screen awake during recording (Android)
      await activateKeepAwakeAsync();
      
      // Show lock screen notification
      const id = await showRecordingNotification();
      setNotificationId(id);
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
      
      // Allow screen to sleep again
      deactivateKeepAwake();
      
      // Dismiss lock screen notification
      await dismissRecordingNotification(notificationId);
      setNotificationId(null);
    } catch (err) {
      console.error('Failed to stop recording', err);
      Alert.alert('Error', 'Could not stop recording');
      deactivateKeepAwake();
      await dismissRecordingNotification(notificationId);
      setNotificationId(null);
    }
  }

  async function combineAudioSegments(segments: string[]): Promise<string[]> {
    // Return all segments - they'll be combined server-side
    console.log(`Preparing ${segments.length} segments for server-side combining...`);
    return segments;
  }

  async function handleRecordingStopped(uriOrSegments: string[] | string) {
    let savedFilename = '';
    let savedFileUri = '';
    
    try {
      setIsUploading(true);

      // ALWAYS save to local storage first to prevent data loss
      const uri = Array.isArray(uriOrSegments) ? uriOrSegments[0] : uriOrSegments;
      savedFilename = `recording_${Date.now()}.m4a`;
      const permanentFile = new File(Paths.document, savedFilename);
      
      console.log('Saving recording locally first...');
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      const writer = permanentFile.writableStream().getWriter();
      await writer.write(uint8Array);
      await writer.close();
      savedFileUri = permanentFile.uri;
      
      console.log('Recording saved locally:', savedFilename);

      // Check if we can upload now
      const uploadStatus = await checkUploadStatus();

      if (uploadStatus.canUpload) {
        // Upload immediately (either single file or multiple segments)
        console.log('Attempting immediate upload...');
        await uploadToBackend(uriOrSegments, savedFileUri, savedFilename);
      } else {
        // Queue for later
        console.log('Queueing for later:', uploadStatus.reason);
        await addToQueue(savedFileUri, savedFilename);
        
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

  async function uploadToBackend(uriOrSegments: string | string[], savedFileUri: string, savedFilename: string) {
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

      // Set a long timeout for large audio files - up to 2 hours to support users with high minute limits
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7200000); // 2 hour timeout

      try {
        const response = await fetch(`${API_URL}${endpoint}`, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${token}`,
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        clearTimeout(timeoutId);

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
        clearTimeout(timeoutId);
        
        // Upload failed - save to queue for retry
        console.log('Upload failed, adding to retry queue...');
        
        try {
          if (savedFileUri && savedFilename) {
            await addToQueue(savedFileUri, savedFilename);
          }
          
          if (err.name === 'AbortError') {
            console.error('Upload timeout after 2 hours');
            Alert.alert(
              'Recording Saved - Upload Timeout', 
              'Your recording is saved locally but the upload timed out. This can happen with very long recordings (60+ minutes) on slow connections.\n\nThe app will retry uploading automatically. You can also check "Recordings" to manually retry.',
              [
                { text: 'OK', onPress: () => navigation.goBack() }
              ]
            );
          } else {
            console.error('Upload error:', err);
            Alert.alert(
              'Recording Saved - Upload Failed', 
              `Your recording is saved locally but upload failed.\n\nError: ${err.message}\n\nThe app will retry automatically. Check "Recordings" to see status.`,
              [
                { text: 'OK', onPress: () => navigation.goBack() }
              ]
            );
          }
        } catch (queueErr: any) {
          console.error('Failed to queue recording:', queueErr);
          Alert.alert(
            'Error',
            `Recording could not be saved: ${queueErr.message}`
          );
        }
      } finally {
        setIsUploading(false);
      }
    } catch (err: any) {
      console.error('Error handling recording:', err);
      Alert.alert('Error', `Could not save recording: ${err.message}`);
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
            <Text style={styles.subtleText}>This may take a few minutes for longer recordings</Text>
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
  subtleText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
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
