import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Recording {
  id: string;
  name: string;
  uri: string;
  date: string;
  duration: string;
  transcript?: string;
  summary?: string;
}

const STORAGE_KEY = '@recaply_recordings';

export const saveRecording = async (
  uri: string,
  duration: string,
  customName?: string,
): Promise<Recording> => {
  try {
    const recordings = await getRecordings();
    const timestamp = new Date().toISOString();
    const recording: Recording = {
      id: Date.now().toString(),
      name: customName || `Meeting ${new Date().toLocaleDateString()}`,
      uri,
      date: new Date().toLocaleString(),
      duration,
    };

    recordings.unshift(recording);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recordings));
    return recording;
  } catch (error) {
    console.error('Error saving recording:', error);
    throw error;
  }
};

export const getRecordings = async (): Promise<Recording[]> => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting recordings:', error);
    return [];
  }
};

export const getRecordingById = async (id: string): Promise<Recording | null> => {
  try {
    const recordings = await getRecordings();
    return recordings.find(r => r.id === id) || null;
  } catch (error) {
    console.error('Error getting recording by ID:', error);
    return null;
  }
};

export const updateTranscript = async (id: string, transcript: string): Promise<void> => {
  try {
    const recordings = await getRecordings();
    const index = recordings.findIndex(r => r.id === id);
    if (index !== -1) {
      recordings[index].transcript = transcript;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recordings));
    }
  } catch (error) {
    console.error('Error updating transcript:', error);
    throw error;
  }
};

export const updateSummary = async (id: string, summary: string): Promise<void> => {
  try {
    const recordings = await getRecordings();
    const index = recordings.findIndex(r => r.id === id);
    if (index !== -1) {
      recordings[index].summary = summary;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recordings));
    }
  } catch (error) {
    console.error('Error updating summary:', error);
    throw error;
  }
};

export const deleteRecording = async (id: string): Promise<void> => {
  try {
    const recordings = await getRecordings();
    const filtered = recordings.filter(r => r.id !== id);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Error deleting recording:', error);
    throw error;
  }
};
