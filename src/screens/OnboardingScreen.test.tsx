import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen, { isOnboardingComplete, resetOnboarding } from './OnboardingScreen';

const mockUseAuth = jest.fn();

jest.mock('../context/AuthContext', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      token: 'token-1',
    });
  });

  it('marks onboarding complete and routes to Home when skipping from root', async () => {
    const navigation = {
      canGoBack: jest.fn(() => false),
      goBack: jest.fn(),
      replace: jest.fn(),
    };

    const { getByText } = render(<OnboardingScreen navigation={navigation} />);

    fireEvent.press(getByText('Skip'));

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('onboarding_complete', 'true'),
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('@recaply_default_translation_language', 'Spanish');
    expect(navigation.replace).toHaveBeenCalledWith('Home');
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('persists selected preferred translation language when completing onboarding', async () => {
    const navigation = {
      canGoBack: jest.fn(() => false),
      goBack: jest.fn(),
      replace: jest.fn(),
    };

    const { getByText } = render(<OnboardingScreen navigation={navigation} />);
    fireEvent.press(getByText('English'));
    fireEvent.press(getByText('Skip'));

    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('@recaply_default_translation_language', 'English'),
    );
  });

  it('helper functions reflect completion status and reset state', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('true');
    expect(await isOnboardingComplete()).toBe(true);

    await resetOnboarding();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('onboarding_complete');
  });
});
