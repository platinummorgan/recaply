/* eslint-disable import/first */

import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockRequestPermissionsAsync = jest.fn();
const mockSetAudioModeAsync = jest.fn();
const mockCreateAsync = jest.fn();
const mockActivateKeepAwakeAsync = jest.fn();
const mockScheduleNotificationAsync = jest.fn();
const mockSetNotificationHandler = jest.fn();
const mockDismissNotificationAsync = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('expo-av', () => ({
  Audio: {
    requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
    setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
    Recording: {
      createAsync: (...args: unknown[]) => mockCreateAsync(...args),
    },
    RecordingOptionsPresets: {
      HIGH_QUALITY: {},
    },
  },
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: (...args: unknown[]) => mockActivateKeepAwakeAsync(...args),
  deactivateKeepAwake: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  dismissNotificationAsync: (...args: unknown[]) => mockDismissNotificationAsync(...args),
  AndroidNotificationPriority: {
    HIGH: 'high',
  },
}));

jest.mock('expo-file-system', () => ({
  Paths: {
    document: '/tmp/document',
    cache: '/tmp/cache',
  },
  File: jest.fn(),
  Directory: jest.fn(),
}));

jest.mock('../services/storage', () => ({
  addToQueue: jest.fn(),
}));

jest.mock('../services/uploadQueue', () => ({
  checkUploadStatus: jest.fn().mockResolvedValue({ canUpload: false, reason: 'offline' }),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

import RecordScreen from './RecordScreen';

describe('RecordScreen', () => {
  const navigation = {
    navigate: jest.fn(),
    goBack: jest.fn(),
    replace: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        subscriptionTier: 'free',
        minutesUsed: 0,
        minutesLimit: 30,
      },
      token: 'token-1',
      refreshUser: jest.fn(),
    });
    mockScheduleNotificationAsync.mockResolvedValue('notif-1');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows permission alert when microphone permission is denied', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const { getByText } = render(<RecordScreen navigation={navigation} />);
    fireEvent.press(getByText('⏺️ Start Recording'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Permission denied',
        'Please allow microphone access',
      ),
    );
    expect(mockCreateAsync).not.toHaveBeenCalled();
  });

  it('enters recording state after successful start', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockCreateAsync.mockResolvedValue({
      recording: {
        pauseAsync: jest.fn(),
        stopAndUnloadAsync: jest.fn(),
        getURI: jest.fn().mockReturnValue('file://recording.m4a'),
      },
    });

    const { getByText, queryByText } = render(<RecordScreen navigation={navigation} />);
    fireEvent.press(getByText('⏺️ Start Recording'));

    await waitFor(() => expect(mockCreateAsync).toHaveBeenCalled());
    await waitFor(() => expect(queryByText('Recording...')).toBeTruthy());
    expect(mockActivateKeepAwakeAsync).toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).toHaveBeenCalled();
    expect(queryByText('⏹️ Stop Recording')).toBeTruthy();
  });

  it('shows upgrade flow when minutes are exhausted', async () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        subscriptionTier: 'free',
        minutesUsed: 30,
        minutesLimit: 30,
      },
      token: 'token-1',
      refreshUser: jest.fn(),
    });

    const { getByText } = render(<RecordScreen navigation={navigation} />);
    fireEvent.press(getByText('⏺️ Start Recording'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Minutes Limit Reached',
        expect.stringContaining('Upgrade to continue recording!'),
        expect.any(Array),
      ),
    );

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const upgradeButton = buttons.find((button: { text: string }) => button.text === 'Upgrade');
    upgradeButton.onPress();

    expect(navigation.navigate).toHaveBeenCalledWith('Subscription');
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
    expect(mockCreateAsync).not.toHaveBeenCalled();
  });

  it('shows start-recording error alert when recorder init fails', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockCreateAsync.mockRejectedValue(new Error('recorder unavailable'));

    const { getByText } = render(<RecordScreen navigation={navigation} />);
    fireEvent.press(getByText('⏺️ Start Recording'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Could not start recording'),
    );
  });
});
