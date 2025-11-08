import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AudioRecorderPlayer from 'react-native-audio-recorder-player';
import DocumentPicker from 'react-native-document-picker';
import {RootStackParamList} from '../navigation/AppNavigator';
import {saveRecording, getRecordings, Recording} from '../services/StorageService';

type RecorderScreenProp = StackNavigationProp<RootStackParamList, 'Home'>;

const audioRecorderPlayer = new AudioRecorderPlayer();

const RecorderScreen = () => {
  const navigation = useNavigation<RecorderScreenProp>();
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState('00:00:00');
  const [recordings, setRecordings] = useState<Recording[]>([]);

  useEffect(() => {
    loadRecordings();
    requestPermissions();
  }, []);

  const loadRecordings = async () => {
    const savedRecordings = await getRecordings();
    setRecordings(savedRecordings);
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const grants = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        ]);

        if (
          grants['android.permission.RECORD_AUDIO'] !== PermissionsAndroid.RESULTS.GRANTED ||
          grants['android.permission.WRITE_EXTERNAL_STORAGE'] !==
            PermissionsAndroid.RESULTS.GRANTED
        ) {
          Alert.alert('Permissions Required', 'Please grant audio recording permissions');
          return false;
        }
        return true;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const startRecording = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const path = `recording_${Date.now()}.m4a`;
      const uri = await audioRecorderPlayer.startRecorder(path);
      audioRecorderPlayer.addRecordBackListener(e => {
        setRecordTime(audioRecorderPlayer.mmssss(Math.floor(e.currentPosition)));
      });
      setIsRecording(true);
      console.log('Recording started:', uri);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    try {
      const result = await audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.removeRecordBackListener();
      setIsRecording(false);
      setRecordTime('00:00:00');

      // Save recording metadata
      const recording = await saveRecording(result, recordTime);
      loadRecordings();

      Alert.alert('Recording Saved', 'Would you like to transcribe it now?', [
        {text: 'Later', style: 'cancel'},
        {
          text: 'Transcribe',
          onPress: () => navigation.navigate('Transcript', {recordingId: recording.id}),
        },
      ]);
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('Error', 'Failed to stop recording');
    }
  };

  const uploadFile = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.audio],
      });

      const recording = await saveRecording(result[0].uri, '00:00:00', result[0].name);
      loadRecordings();

      Alert.alert('File Uploaded', 'Would you like to transcribe it now?', [
        {text: 'Later', style: 'cancel'},
        {
          text: 'Transcribe',
          onPress: () => navigation.navigate('Transcript', {recordingId: recording.id}),
        },
      ]);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        console.error('Upload error:', err);
        Alert.alert('Error', 'Failed to upload file');
      }
    }
  };

  const openRecording = (recording: Recording) => {
    navigation.navigate('Transcript', {recordingId: recording.id});
  };

  return (
    <View style={styles.container}>
      <View style={styles.recordingSection}>
        <View style={styles.visualizer}>
          <Icon name="graphic-eq" size={80} color={isRecording ? '#ef4444' : '#94a3b8'} />
        </View>

        <Text style={styles.timer}>{recordTime}</Text>

        <View style={styles.controls}>
          {!isRecording ? (
            <>
              <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
                <Icon name="fiber-manual-record" size={60} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.recordLabel}>Tap to Record</Text>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
                <Icon name="stop" size={60} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.recordLabel}>Recording...</Text>
            </>
          )}
        </View>

        <TouchableOpacity style={styles.uploadButton} onPress={uploadFile}>
          <Icon name="upload-file" size={24} color="#6366f1" />
          <Text style={styles.uploadText}>Upload Audio File</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.recordingsSection}>
        <Text style={styles.sectionTitle}>Recent Recordings</Text>
        <FlatList
          data={recordings}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <TouchableOpacity style={styles.recordingItem} onPress={() => openRecording(item)}>
              <Icon name="audiotrack" size={24} color="#6366f1" />
              <View style={styles.recordingInfo}>
                <Text style={styles.recordingName}>{item.name}</Text>
                <Text style={styles.recordingDate}>{item.date}</Text>
              </View>
              <Icon name="chevron-right" size={24} color="#94a3b8" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No recordings yet. Start recording!</Text>
          }
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  recordingSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  visualizer: {
    marginBottom: 20,
  },
  timer: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 40,
  },
  controls: {
    alignItems: 'center',
    marginBottom: 30,
  },
  recordButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  stopButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#64748b',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  recordLabel: {
    marginTop: 15,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '600',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 2,
    borderColor: '#6366f1',
    borderRadius: 8,
  },
  uploadText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#6366f1',
    fontWeight: '600',
  },
  recordingsSection: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    elevation: 5,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 15,
  },
  recordingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    marginBottom: 10,
  },
  recordingInfo: {
    flex: 1,
    marginLeft: 15,
  },
  recordingName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  recordingDate: {
    fontSize: 14,
    color: '#64748b',
  },
  emptyText: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 16,
    marginTop: 40,
  },
});

export default RecorderScreen;
