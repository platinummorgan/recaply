import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import {
  getUploadQueue,
  updateQueueItemStatus,
  removeFromQueue,
  getSettings,
  QueuedUpload,
} from './storage';

const BACKEND_URL = 'https://web-production-abd11.up.railway.app';

/**
 * Check if we should upload based on network type and settings
 */
async function shouldUpload(netInfo: NetInfoState): Promise<boolean> {
  const settings = await getSettings();

  // No connection
  if (!netInfo.isConnected) {
    console.log('No internet connection');
    return false;
  }

  // WiFi only mode
  if (settings.wifiOnly && netInfo.type !== 'wifi') {
    console.log('WiFi only mode enabled, not on WiFi');
    return false;
  }

  // Cellular not allowed
  if (!settings.allowCellular && netInfo.type === 'cellular') {
    console.log('Cellular data not allowed');
    return false;
  }

  return true;
}

/**
 * Upload a single queued recording
 */
async function uploadRecording(item: QueuedUpload): Promise<void> {
  console.log('Uploading queued recording:', item.id);

  try {
    // Update status to uploading
    await updateQueueItemStatus(item.id, 'uploading');

    // Create form data
    const formData = new FormData();
    formData.append('audio', {
      uri: item.audioUri,
      type: 'audio/m4a',
      name: item.filename,
    } as any);

    // Upload to backend
    const response = await fetch(`${BACKEND_URL}/api/audio/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
        'Authorization': `Bearer ${item.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('Upload successful:', data);

    // Mark as completed and remove from queue
    await updateQueueItemStatus(item.id, 'completed');
    await removeFromQueue(item.id);

    // Delete local audio file
    try {
      await FileSystem.deleteAsync(item.audioUri, { idempotent: true });
      console.log('Deleted local file:', item.audioUri);
    } catch (err) {
      console.warn('Could not delete local file:', err);
    }
  } catch (error) {
    console.error('Upload failed:', error);
    await updateQueueItemStatus(item.id, 'failed');
    throw error;
  }
}

/**
 * Process the upload queue
 */
export async function processQueue(fallbackToken?: string): Promise<void> {
  console.log('Processing upload queue...');

  // Check network status
  const netInfo = await NetInfo.fetch();
  const canUpload = await shouldUpload(netInfo);

  if (!canUpload) {
    console.log('Cannot upload at this time');
    return;
  }

  // Get pending items
  const queue = await getUploadQueue();
  const pending = queue.filter((item) => item.status === 'pending' || item.status === 'failed');

  console.log(`Found ${pending.length} pending uploads`);

  // Upload each item
  for (const item of pending) {
    try {
      // Use item's token if available, otherwise use fallback token
      const itemWithToken = {
        ...item,
        token: item.token || fallbackToken || '',
      };
      
      if (!itemWithToken.token) {
        console.error('No token available for upload:', item.id);
        continue;
      }
      
      await uploadRecording(itemWithToken);
    } catch (error) {
      console.error('Failed to upload item:', item.id, error);
      // Continue with next item even if this one fails
    }
  }

  console.log('Queue processing complete');
}

/**
 * Start monitoring network changes and auto-upload when online
 */
export function startQueueMonitoring(): () => void {
  console.log('Starting queue monitoring...');

  const unsubscribe = NetInfo.addEventListener((state) => {
    console.log('Network state changed:', state.type, state.isConnected);

    if (state.isConnected) {
      // Network is available, try to process queue
      processQueue().catch((err) => {
        console.error('Error processing queue:', err);
      });
    }
  });

  // Also process queue immediately on start
  processQueue().catch((err) => {
    console.error('Error processing queue:', err);
  });

  return unsubscribe;
}

/**
 * Check current network status and if upload is allowed
 */
export async function checkUploadStatus(): Promise<{
  canUpload: boolean;
  reason?: string;
}> {
  const netInfo = await NetInfo.fetch();
  const settings = await getSettings();

  if (!netInfo.isConnected) {
    return { canUpload: false, reason: 'No internet connection' };
  }

  if (settings.wifiOnly && netInfo.type !== 'wifi') {
    return { canUpload: false, reason: 'WiFi only mode enabled' };
  }

  if (!settings.allowCellular && netInfo.type === 'cellular') {
    return { canUpload: false, reason: 'Cellular data disabled' };
  }

  return { canUpload: true };
}
