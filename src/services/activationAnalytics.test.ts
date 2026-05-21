import { trackActivationEvent } from './activationAnalytics';

describe('activationAnalytics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns false when token is missing', async () => {
    const result = await trackActivationEvent(null, {
      eventName: 'onboarding_viewed',
      source: 'onboarding_screen',
    });

    expect(result).toBe(false);
  });

  it('posts activation event payload when token is present', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const result = await trackActivationEvent('token-1', {
      eventName: 'summary_generate_completed',
      source: 'transcript_screen',
      outcome: 'success',
      step: 'summary_ready',
      recordingId: 'recording-1',
    });

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/user/activation-events');
  });
});
