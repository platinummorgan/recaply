/* eslint-disable import/first */

const mockNetInfoFetch = jest.fn();
const mockNetInfoSubscribe = jest.fn();
const mockDeleteAsync = jest.fn();
const mockGetUploadQueue = jest.fn();
const mockUpdateQueueItemStatus = jest.fn();
const mockRemoveFromQueue = jest.fn();
const mockGetSettings = jest.fn();

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: (...args: unknown[]) => mockNetInfoFetch(...args),
    addEventListener: (...args: unknown[]) => mockNetInfoSubscribe(...args),
  },
}));

jest.mock('expo-file-system', () => ({
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

jest.mock('./storage', () => ({
  getUploadQueue: (...args: unknown[]) => mockGetUploadQueue(...args),
  updateQueueItemStatus: (...args: unknown[]) => mockUpdateQueueItemStatus(...args),
  removeFromQueue: (...args: unknown[]) => mockRemoveFromQueue(...args),
  getSettings: (...args: unknown[]) => mockGetSettings(...args),
}));

import { checkUploadStatus, processQueue } from './uploadQueue';

describe('uploadQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetSettings.mockResolvedValue({ wifiOnly: false, allowCellular: true });
    mockGetUploadQueue.mockResolvedValue([]);
    mockNetInfoFetch.mockResolvedValue({ isConnected: true, type: 'wifi' });
    mockDeleteAsync.mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips queue processing when offline', async () => {
    mockNetInfoFetch.mockResolvedValueOnce({ isConnected: false, type: 'none' });

    await processQueue();

    expect(mockGetUploadQueue).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('uploads pending recording and removes it from queue', async () => {
    mockGetUploadQueue.mockResolvedValueOnce([
      {
        id: 'q1',
        audioUri: 'file://q1.m4a',
        filename: 'q1.m4a',
        timestamp: 100,
        status: 'pending',
        token: 'item-token',
      },
    ]);

    await processQueue();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/api/audio/upload');
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization).toBe('Bearer item-token');
    expect(mockUpdateQueueItemStatus).toHaveBeenNthCalledWith(1, 'q1', 'uploading');
    expect(mockUpdateQueueItemStatus).toHaveBeenNthCalledWith(2, 'q1', 'completed');
    expect(mockRemoveFromQueue).toHaveBeenCalledWith('q1');
    expect(mockDeleteAsync).toHaveBeenCalledWith('file://q1.m4a', { idempotent: true });
  });

  it('uses fallback token for legacy queue items without token', async () => {
    mockGetUploadQueue.mockResolvedValueOnce([
      {
        id: 'q2',
        audioUri: 'file://q2.m4a',
        filename: 'q2.m4a',
        timestamp: 200,
        status: 'failed',
      },
    ]);

    await processQueue('fallback-token');

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect((global.fetch as jest.Mock).mock.calls[0][1].headers.Authorization).toBe('Bearer fallback-token');
  });

  it('marks queue item as failed when upload response is not ok', async () => {
    mockGetUploadQueue.mockResolvedValueOnce([
      {
        id: 'q3',
        audioUri: 'file://q3.m4a',
        filename: 'q3.m4a',
        timestamp: 300,
        status: 'pending',
        token: 'item-token',
      },
    ]);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    await processQueue();

    expect(mockUpdateQueueItemStatus).toHaveBeenNthCalledWith(1, 'q3', 'uploading');
    expect(mockUpdateQueueItemStatus).toHaveBeenNthCalledWith(2, 'q3', 'failed');
    expect(mockRemoveFromQueue).not.toHaveBeenCalled();
  });

  it('reports WiFi-only restrictions in upload status', async () => {
    mockGetSettings.mockResolvedValueOnce({ wifiOnly: true, allowCellular: true });
    mockNetInfoFetch.mockResolvedValueOnce({ isConnected: true, type: 'cellular' });

    const status = await checkUploadStatus();
    expect(status).toEqual({
      canUpload: false,
      reason: 'WiFi only mode enabled',
    });
  });
});
