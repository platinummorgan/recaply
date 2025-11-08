import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@recaply_upload_queue';
const SETTINGS_KEY = '@recaply_settings';

export interface QueuedUpload {
  id: string;
  audioUri: string;
  filename: string;
  timestamp: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
}

export interface AppSettings {
  wifiOnly: boolean;
  allowCellular: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  wifiOnly: false,
  allowCellular: true,
};

/**
 * Get all pending uploads from queue
 */
export async function getUploadQueue(): Promise<QueuedUpload[]> {
  try {
    const json = await AsyncStorage.getItem(QUEUE_KEY);
    return json ? JSON.parse(json) : [];
  } catch (error) {
    console.error('Failed to load upload queue:', error);
    return [];
  }
}

/**
 * Add a new recording to the upload queue
 */
export async function addToQueue(audioUri: string, filename: string): Promise<string> {
  try {
    const queue = await getUploadQueue();
    const newUpload: QueuedUpload = {
      id: Date.now().toString(),
      audioUri,
      filename,
      timestamp: Date.now(),
      status: 'pending',
    };
    queue.push(newUpload);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    console.log('Added to queue:', newUpload.id);
    return newUpload.id;
  } catch (error) {
    console.error('Failed to add to queue:', error);
    throw error;
  }
}

/**
 * Update status of a queued upload
 */
export async function updateQueueItemStatus(
  id: string,
  status: QueuedUpload['status']
): Promise<void> {
  try {
    const queue = await getUploadQueue();
    const index = queue.findIndex((item) => item.id === id);
    if (index !== -1) {
      queue[index].status = status;
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      console.log('Updated queue item:', id, status);
    }
  } catch (error) {
    console.error('Failed to update queue item:', error);
  }
}

/**
 * Remove an item from the queue
 */
export async function removeFromQueue(id: string): Promise<void> {
  try {
    const queue = await getUploadQueue();
    const filtered = queue.filter((item) => item.id !== id);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
    console.log('Removed from queue:', id);
  } catch (error) {
    console.error('Failed to remove from queue:', error);
  }
}

/**
 * Get app settings
 */
export async function getSettings(): Promise<AppSettings> {
  try {
    const json = await AsyncStorage.getItem(SETTINGS_KEY);
    return json ? { ...DEFAULT_SETTINGS, ...JSON.parse(json) } : DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Failed to load settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Update app settings
 */
export async function updateSettings(settings: Partial<AppSettings>): Promise<void> {
  try {
    const current = await getSettings();
    const updated = { ...current, ...settings };
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    console.log('Settings updated:', updated);
  } catch (error) {
    console.error('Failed to update settings:', error);
    throw error;
  }
}

/**
 * Get count of pending uploads
 */
export async function getPendingCount(): Promise<number> {
  const queue = await getUploadQueue();
  return queue.filter((item) => item.status === 'pending').length;
}
