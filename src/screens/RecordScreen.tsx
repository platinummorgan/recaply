import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Animated,
  Easing,
} from 'react-native';
import { Audio } from 'expo-av';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { Paths, File } from 'expo-file-system';
import { addToQueue } from '../services/storage';
import { checkUploadStatus } from '../services/uploadQueue';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../config/api';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';
import type { RecordingMetadata } from '../types/recording';

// Recording & Upload Limits:
// - No hard limit on recording duration (limited only by user's available minutes)
// - Backend transcription timeout: 30 minutes (handles recordings up to ~25 minutes reliably)
// - Client upload timeout: 2 hours (handles upload + transcription for very long recordings)
// - File size limit: 500MB (supports 60+ minute recordings)
// - All recordings are saved locally first to prevent data loss on timeout/error
// - Failed uploads are automatically queued for retry

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function toIsoFromLocalDateAndTime(dateValue: string, timeValue: string): string {
  const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim()) ? dateValue.trim() : formatDateInput(new Date());
  const normalizedTime = /^\d{2}:\d{2}$/.test(timeValue.trim()) ? timeValue.trim() : formatTimeInput(new Date());
  const parsed = new Date(`${normalizedDate}T${normalizedTime}:00`);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function buildFilenameFromMeetingName(meetingName: string): string {
  const normalized = meetingName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) {
    return `recording_${Date.now()}.m4a`;
  }
  return `${normalized}_${Date.now()}.m4a`;
}

function formatMeetingPreview(dateValue: string, timeValue: string): string {
  const iso = toIsoFromLocalDateAndTime(dateValue, timeValue);
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 'Uses current date/time';
  }
  return `${parsed.toLocaleDateString()} at ${parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const MEETING_NAME_TEMPLATES = ['Team Sync', 'Client Call', 'Interview', 'Planning'];
const CONTEXT_TEMPLATES = [
  'Status updates and blockers',
  'Decisions needed today',
  'Review deliverables and owners',
];

const PARTICIPANT_TEMPLATES = ['Design', 'Engineering', 'Product', 'Client'];

function normalizeParticipant(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 60);
}

function normalizeParticipantList(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeParticipant(value))
        .filter((value) => value.length > 0),
    ),
  ).slice(0, 20);
}

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
  const [meetingName, setMeetingName] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [meetingContext, setMeetingContext] = useState('');
  const [participantInput, setParticipantInput] = useState('');
  const [meetingParticipants, setMeetingParticipants] = useState<string[]>([]);
  const [meetingDate, setMeetingDate] = useState(() => formatDateInput(new Date()));
  const [meetingTime, setMeetingTime] = useState(() => formatTimeInput(new Date()));
  const [showMetadataDetails, setShowMetadataDetails] = useState(false);
  const plan = user?.subscriptionTier?.toUpperCase() || 'FREE';
  const minutesUsed = user?.minutesUsed || 0;
  const minutesLimit = user?.minutesLimit || 30;
  const isPro = user?.subscriptionTier === 'pro';
  const usagePercent = isPro ? 0 : Math.min(100, Math.round((minutesUsed / Math.max(minutesLimit, 1)) * 100));
  const minutesLabel = isPro ? 'Unlimited' : `${Math.max(minutesLimit - minutesUsed, 0).toFixed(0)} min left`;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const heroMotion = useRef(new Animated.Value(0)).current;
  const liveStateLabel = isUploading ? 'Syncing' : isRecording ? (isPaused ? 'Paused' : 'Live') : 'Ready';
  const meetingReadinessLabel = meetingName.trim().length > 0 ? 'Meeting tagged' : 'Add meeting name';
  const participantSignal = meetingParticipants.length > 0
    ? `${meetingParticipants.length} participant${meetingParticipants.length > 1 ? 's' : ''}`
    : 'No participants tagged';
  const pulseMotionStyle = useMemo(
    () => ({
      transform: [{ scale: pulseScale }],
      opacity: pulseScale.interpolate({
        inputRange: [0.94, 1.08],
        outputRange: [0.85, 1],
      }),
    }),
    [pulseScale],
  );
  const heroMotionStyle = useMemo(
    () => ({
      opacity: heroMotion,
      transform: [
        {
          translateY: heroMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [14, 0],
          }),
        },
      ],
    }),
    [heroMotion],
  );

  // Set up notification handler
  useEffect(() => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
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

  useEffect(() => {
    heroMotion.setValue(0);
    const animation = Animated.timing(heroMotion, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [heroMotion]);

  useEffect(() => {
    if (isRecording && !isPaused && !isUploading) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.08,
            duration: 780,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 0.94,
            duration: 780,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => {
        pulse.stop();
        pulseScale.setValue(1);
      };
    }

    pulseScale.setValue(1);
    return undefined;
  }, [isPaused, isRecording, isUploading, pulseScale]);

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

  function addParticipant(rawValue: string) {
    const normalized = normalizeParticipant(rawValue);
    if (!normalized) {
      return;
    }
    setMeetingParticipants((current) => normalizeParticipantList([...current, normalized]));
    setParticipantInput('');
  }

  function removeParticipant(value: string) {
    setMeetingParticipants((current) => current.filter((item) => item !== value));
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

  async function handleRecordingStopped(uriOrSegments: string[] | string) {
    let savedFilename = '';
    let savedFileUri = '';
    const recordingMetadata: RecordingMetadata = {
      meetingName: meetingName.trim() || undefined,
      meetingLocation: meetingLocation.trim() || undefined,
      meetingContext: meetingContext.trim() || undefined,
      meetingAt: toIsoFromLocalDateAndTime(meetingDate, meetingTime),
      meetingParticipants: meetingParticipants.length > 0 ? meetingParticipants : undefined,
    };
    
    try {
      setIsUploading(true);

      // ALWAYS save to local storage first to prevent data loss
      const uri = Array.isArray(uriOrSegments) ? uriOrSegments[0] : uriOrSegments;
      savedFilename = buildFilenameFromMeetingName(meetingName);
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
        await uploadToBackend(uriOrSegments, savedFileUri, savedFilename, recordingMetadata);
      } else {
        // Queue for later
        console.log('Queueing for later:', uploadStatus.reason);
        await addToQueue(savedFileUri, savedFilename, token || undefined, recordingMetadata);
        
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

  async function uploadToBackend(
    uriOrSegments: string | string[],
    savedFileUri: string,
    savedFilename: string,
    recordingMetadata?: RecordingMetadata,
  ) {
    try {
      setIsUploading(true);

      const isMultiSegment = Array.isArray(uriOrSegments) && uriOrSegments.length > 1;
      const endpointPath = isMultiSegment ? '/audio/upload-segments' : '/audio/upload';
      const requestUrl = apiUrl(endpointPath);

      console.log('Uploading to:', requestUrl);
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
          name: savedFilename,
        } as any);
      }
      if (recordingMetadata?.meetingName) {
        formData.append('meetingName', recordingMetadata.meetingName);
      }
      if (recordingMetadata?.meetingLocation) {
        formData.append('meetingLocation', recordingMetadata.meetingLocation);
      }
      if (recordingMetadata?.meetingContext) {
        formData.append('meetingContext', recordingMetadata.meetingContext);
      }
      if (recordingMetadata?.meetingAt) {
        formData.append('meetingAt', recordingMetadata.meetingAt);
      }
      if (recordingMetadata?.meetingParticipants && recordingMetadata.meetingParticipants.length > 0) {
        formData.append('meetingParticipants', JSON.stringify(recordingMetadata.meetingParticipants));
      }

      // Set a long timeout for large audio files - up to 2 hours to support users with high minute limits
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7200000); // 2 hour timeout

      try {
        const response = await fetch(requestUrl, {
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
            filename: data.filename || savedFilename,
            recordingId: data.recordingId,
            audioUrl: data.audioUrl,
            meetingName: recordingMetadata?.meetingName,
            meetingLocation: recordingMetadata?.meetingLocation,
            meetingContext: recordingMetadata?.meetingContext,
            meetingAt: recordingMetadata?.meetingAt,
            meetingParticipants: recordingMetadata?.meetingParticipants,
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
            await addToQueue(savedFileUri, savedFilename, token || undefined, recordingMetadata);
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View pointerEvents="none" style={styles.bgOrbTop} />
      <View pointerEvents="none" style={styles.bgOrbBottom} />

      <Animated.View style={[styles.fullWidth, heroMotionStyle]}>
        <AppCard variant="dark" style={styles.headerCard}>
          <View style={styles.headerGlowPrimary} />
          <View style={styles.headerGlowSecondary} />
          <View style={styles.headerTopRow}>
            <View style={styles.headerTitleBlock}>
              <Text style={styles.headerKicker}>Capture Studio</Text>
              <Text style={styles.title}>Record Audio</Text>
              <Text style={styles.subtitle}>Capture first. Summarize right after.</Text>
            </View>
            <View
              style={[
                styles.liveBadge,
                isRecording && !isPaused && !isUploading && styles.liveBadgeRecording,
                isPaused && styles.liveBadgePaused,
                isUploading && styles.liveBadgeUploading,
              ]}
            >
              <Text style={styles.liveBadgeText}>{liveStateLabel}</Text>
            </View>
          </View>

          <View style={styles.signalRow}>
            <View style={styles.signalChip}>
              <Text style={styles.signalChipText}>Auto-save enabled</Text>
            </View>
            <View style={styles.signalChip}>
              <Text style={styles.signalChipText}>Queue retry protection</Text>
            </View>
          </View>

          <View style={styles.planRow}>
            <Text style={styles.planLabel}>Plan</Text>
            <View style={[styles.planBadge, isPro && styles.planBadgePro]}>
              <Text style={styles.planText}>{plan}</Text>
            </View>
          </View>

          {!isPro && (
            <>
              <View style={styles.usageTrack}>
                <View style={[styles.usageFill, { width: `${usagePercent}%` }]} />
              </View>
              <View style={styles.usageMetaRow}>
                <Text style={styles.usageMetaText}>{minutesUsed.toFixed(0)} / {minutesLimit.toFixed(0)} min used</Text>
                <Text style={styles.usageMetaText}>{minutesLabel}</Text>
              </View>
            </>
          )}

          {isPro && <Text style={styles.usageMetaText}>Unlimited minutes available</Text>}
        </AppCard>
      </Animated.View>

      <AppCard style={styles.metadataCard}>
        <View style={styles.metadataHeaderRow}>
          <View>
            <Text style={styles.metadataTitle}>Meeting Context</Text>
            <Text style={styles.metadataSubtitle}>
              Add context now for better organization and summaries.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.metadataToggle}
            onPress={() => setShowMetadataDetails((current) => !current)}
          >
            <Text style={styles.metadataToggleText}>
              {showMetadataDetails ? 'Quick Mode' : 'Add Details'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.metadataSignalRow}>
          <View style={styles.metadataSignalChip}>
            <Text style={styles.metadataSignalText}>{meetingReadinessLabel}</Text>
          </View>
          <View style={styles.metadataSignalChip}>
            <Text style={styles.metadataSignalText}>{participantSignal}</Text>
          </View>
        </View>

        <TextInput
          style={styles.metadataInput}
          placeholder="Meeting name (e.g., Weekly Product Sync)"
          placeholderTextColor={colors.textMuted}
          value={meetingName}
          onChangeText={setMeetingName}
          maxLength={120}
        />
        <View style={styles.templateRow}>
          {MEETING_NAME_TEMPLATES.map((template) => (
            <TouchableOpacity
              key={template}
              style={styles.templateChip}
              onPress={() => setMeetingName(template)}
            >
              <Text style={styles.templateChipText}>{template}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!showMetadataDetails && (
          <View style={styles.metadataQuickSummary}>
            <Text style={styles.metadataQuickSummaryText}>
              Recording time: {formatMeetingPreview(meetingDate, meetingTime)}
            </Text>
            <Text style={styles.metadataQuickSummaryText}>
              {meetingLocation.trim() ? `Location: ${meetingLocation.trim()}` : 'No location set'}
            </Text>
            <Text style={styles.metadataQuickSummaryText}>
              {meetingParticipants.length > 0
                ? `Participants: ${meetingParticipants.join(', ')}`
                : 'No participants tagged'}
            </Text>
          </View>
        )}

        {showMetadataDetails && (
          <>
            <View style={styles.metadataRow}>
              <TextInput
                style={[styles.metadataInput, styles.metadataInputHalf]}
                placeholder="Date (YYYY-MM-DD)"
                placeholderTextColor={colors.textMuted}
                value={meetingDate}
                onChangeText={setMeetingDate}
                maxLength={10}
              />
              <TextInput
                style={[styles.metadataInput, styles.metadataInputHalf]}
                placeholder="Time (HH:MM)"
                placeholderTextColor={colors.textMuted}
                value={meetingTime}
                onChangeText={setMeetingTime}
                maxLength={5}
              />
            </View>
            <TextInput
              style={styles.metadataInput}
              placeholder="Location (optional)"
              placeholderTextColor={colors.textMuted}
              value={meetingLocation}
              onChangeText={setMeetingLocation}
              maxLength={120}
            />
            <View style={styles.participantInputRow}>
              <TextInput
                style={[styles.metadataInput, styles.participantInput]}
                placeholder="Add participant (optional)"
                placeholderTextColor={colors.textMuted}
                value={participantInput}
                onChangeText={setParticipantInput}
                onSubmitEditing={() => addParticipant(participantInput)}
                maxLength={60}
              />
              <AppButton
                label="Add"
                variant="info"
                style={styles.participantAddButton}
                textStyle={styles.participantAddButtonText}
                onPress={() => addParticipant(participantInput)}
              />
            </View>
            <View style={styles.templateRow}>
              {PARTICIPANT_TEMPLATES.map((template) => (
                <TouchableOpacity
                  key={template}
                  style={styles.templateChip}
                  onPress={() => addParticipant(template)}
                >
                  <Text style={styles.templateChipText}>{template}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {meetingParticipants.length > 0 && (
              <View style={styles.participantChipsRow}>
                {meetingParticipants.map((participant) => (
                  <TouchableOpacity
                    key={participant}
                    style={styles.participantChip}
                    onPress={() => removeParticipant(participant)}
                  >
                    <Text style={styles.participantChipText}>{participant} ×</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TextInput
              style={[styles.metadataInput, styles.metadataContextInput]}
              placeholder="Agenda / context (optional)"
              placeholderTextColor={colors.textMuted}
              value={meetingContext}
              onChangeText={setMeetingContext}
              multiline
              textAlignVertical="top"
              maxLength={500}
            />
            <View style={styles.templateRow}>
              {CONTEXT_TEMPLATES.map((template) => (
                <TouchableOpacity
                  key={template}
                  style={styles.templateChip}
                  onPress={() => setMeetingContext(template)}
                >
                  <Text style={styles.templateChipText}>{template}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </AppCard>

      <AppCard style={styles.recordingCard}>
        <View style={styles.recordingArea}>
          {isUploading ? (
            <>
              <ActivityIndicator size="large" color="#0ea5e9" />
              <Text style={styles.statusText}>Uploading & Transcribing...</Text>
              <Text style={styles.subtleText}>This may take a few minutes for longer recordings</Text>
            </>
          ) : isRecording ? (
            <>
              <Animated.View
                style={[
                  styles.recordingIndicator,
                  isPaused ? styles.paused : styles.recording,
                  !isPaused && pulseMotionStyle,
                ]}
              />
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
              <Text style={styles.subtleText}>Press start when your meeting begins</Text>
            </>
          )}
        </View>
      </AppCard>

      {isRecording && !isUploading && (
        <AppButton
          label={isPaused ? '▶️ Resume' : '⏸️ Pause'}
          variant="warning"
          style={styles.controlButton}
          textStyle={styles.buttonText}
          onPress={isPaused ? resumeRecording : pauseRecording}
        />
      )}

      <AppButton
        label={isRecording ? '⏹️ Stop Recording' : '⏺️ Start Recording'}
        variant={isRecording ? 'danger' : 'primary'}
        style={styles.controlButton}
        textStyle={styles.buttonText}
        onPress={isRecording ? stopRecording : startRecording}
        disabled={isUploading}
      />

      <Text style={styles.captureHint}>Recordings are saved locally before upload to prevent data loss.</Text>

      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
        disabled={isRecording || isUploading}
      >
        <Text style={[styles.backButtonText, (isRecording || isUploading) && styles.disabledText]}>
          ← Back to Home
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  bgOrbTop: {
    position: 'absolute',
    top: -120,
    right: -35,
    width: 230,
    height: 230,
    borderRadius: 999,
    backgroundColor: '#dbe8ff',
    opacity: 0.72,
  },
  bgOrbBottom: {
    position: 'absolute',
    top: 280,
    left: -65,
    width: 200,
    height: 200,
    borderRadius: 999,
    backgroundColor: '#edf4ff',
    opacity: 0.92,
  },
  fullWidth: {
    width: '100%',
  },
  headerCard: {
    width: '100%',
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: 14,
    borderColor: '#2f4a67',
    overflow: 'hidden',
  },
  headerGlowPrimary: {
    position: 'absolute',
    top: -60,
    right: -22,
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: '#1e6dff',
    opacity: 0.34,
  },
  headerGlowSecondary: {
    position: 'absolute',
    bottom: -90,
    left: -45,
    width: 210,
    height: 210,
    borderRadius: 999,
    backgroundColor: '#335f92',
    opacity: 0.34,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerKicker: {
    fontSize: 11,
    color: colors.textOnDarkMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: typography.heading,
  },
  liveBadge: {
    backgroundColor: '#17314a',
    borderWidth: 1,
    borderColor: '#355474',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveBadgeRecording: {
    backgroundColor: '#8d1313',
    borderColor: '#f66f6f',
  },
  liveBadgePaused: {
    backgroundColor: '#8d5607',
    borderColor: '#e4ab44',
  },
  liveBadgeUploading: {
    backgroundColor: '#1a3f8b',
    borderColor: '#7ca5ea',
  },
  liveBadgeText: {
    color: colors.surface,
    fontSize: 11,
    fontFamily: typography.heading,
  },
  signalRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  signalChip: {
    backgroundColor: '#17314a',
    borderWidth: 1,
    borderColor: '#355474',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  signalChipText: {
    color: colors.textOnDark,
    fontSize: 11,
    fontFamily: typography.heading,
  },
  title: {
    marginTop: 6,
    fontSize: 30,
    lineHeight: 34,
    color: colors.textOnDark,
    fontFamily: typography.display,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textOnDarkMuted,
    fontFamily: typography.body,
  },
  planRow: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planLabel: {
    fontSize: 13,
    color: colors.textOnDarkMuted,
    fontFamily: typography.heading,
  },
  planBadge: {
    backgroundColor: colors.accentStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  planBadgePro: {
    backgroundColor: colors.successDark,
    borderColor: colors.success,
  },
  planText: {
    color: colors.surface,
    fontSize: 11,
    fontFamily: typography.heading,
  },
  usageTrack: {
    marginTop: 12,
    height: 9,
    borderRadius: radii.pill,
    backgroundColor: '#17314a',
    overflow: 'hidden',
  },
  usageFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  usageMetaRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  usageMetaText: {
    fontSize: 12,
    color: colors.textOnDarkMuted,
    fontFamily: typography.body,
  },
  recordingCard: {
    width: '100%',
    borderRadius: radii.xl,
    paddingVertical: 22,
    borderColor: '#d0ddef',
    backgroundColor: '#fbfdff',
    marginBottom: 16,
  },
  metadataCard: {
    width: '100%',
    borderRadius: radii.xl,
    padding: spacing.md,
    borderColor: '#d0ddef',
    backgroundColor: '#fbfdff',
    marginBottom: 14,
  },
  metadataTitle: {
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  metadataSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  metadataHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  metadataSignalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  metadataSignalChip: {
    backgroundColor: colors.accentInfoSoft,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metadataSignalText: {
    color: colors.accentInfoText,
    fontSize: 11,
    fontFamily: typography.heading,
  },
  metadataToggle: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  metadataToggleText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: typography.heading,
  },
  metadataInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 10,
    fontFamily: typography.body,
  },
  metadataContextInput: {
    minHeight: 80,
  },
  participantInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  participantInput: {
    flex: 1,
    marginBottom: 0,
  },
  participantAddButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  participantAddButtonText: {
    fontSize: 12,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  participantChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  participantChip: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  participantChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  metadataRow: {
    flexDirection: 'row',
    gap: 8,
  },
  metadataInputHalf: {
    flex: 1,
  },
  metadataQuickSummary: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  metadataQuickSummaryText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: typography.body,
  },
  templateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  templateChip: {
    backgroundColor: colors.accentInfoSoft,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  templateChipText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  recordingArea: {
    alignItems: 'center',
    minHeight: 220,
    justifyContent: 'center',
  },
  recordingIndicator: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: colors.borderSoft,
    marginBottom: 16,
    borderWidth: 6,
    borderColor: colors.border,
  },
  recording: {
    backgroundColor: colors.danger,
    borderColor: colors.dangerBorder,
    shadowColor: colors.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  paused: {
    backgroundColor: colors.warning,
    borderColor: colors.warningSoft,
    shadowColor: colors.warning,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 8,
  },
  statusText: {
    fontSize: 19,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  subtleText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 24,
    fontFamily: typography.body,
  },
  durationText: {
    fontSize: 30,
    fontFamily: typography.display,
    color: colors.textPrimary,
    marginTop: 10,
  },
  controlButton: {
    width: '100%',
    paddingVertical: 17,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 19,
    fontFamily: typography.heading,
  },
  captureHint: {
    marginTop: -2,
    marginBottom: 6,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    fontFamily: typography.body,
  },
  backButton: {
    paddingVertical: 8,
  },
  backButtonText: {
    color: colors.accent,
    fontSize: 15,
    fontFamily: typography.heading,
  },
  disabledText: {
    color: colors.borderSoft,
  },
});
