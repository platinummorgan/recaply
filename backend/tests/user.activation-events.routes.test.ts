import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/server';

function createAuthToken(userId: string, email = 'activation-test@example.com') {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET || 'test-jwt-secret');
}

describe('User Activation Events Route', () => {
  afterEach(() => {
    delete process.env.METRICS_API_KEY;
  });

  it('returns 401 when auth token is missing', async () => {
    const response = await request(app).post('/api/user/activation-events').send({
      eventName: 'onboarding_viewed',
      source: 'onboarding_screen',
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('No token provided');
  });

  it('returns 400 when eventName is missing', async () => {
    const token = createAuthToken('user-activation-1');

    const response = await request(app)
      .post('/api/user/activation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source: 'onboarding_screen',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('eventName is required');
  });

  it('returns 400 for unsupported eventName', async () => {
    const token = createAuthToken('user-activation-2');

    const response = await request(app)
      .post('/api/user/activation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'unsupported_activation_event',
        source: 'onboarding_screen',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Unsupported activation event');
  });

  it('tracks activation events and exposes counters in /metrics', async () => {
    const token = createAuthToken('user-activation-3');

    const onboardingResponse = await request(app)
      .post('/api/user/activation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'onboarding_completed',
        source: 'onboarding_screen',
        outcome: 'completed',
        step: 'slide_4',
        platform: 'android',
      });

    expect(onboardingResponse.status).toBe(200);
    expect(onboardingResponse.body.success).toBe(true);
    expect(onboardingResponse.body.eventName).toBe('onboarding_completed');
    expect(onboardingResponse.body.source).toBe('onboarding_screen');

    const summaryResponse = await request(app)
      .post('/api/user/activation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'summary_generate_completed',
        source: 'transcript_screen',
        outcome: 'success',
        step: 'summary_ready',
        platform: 'android',
      });

    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body.success).toBe(true);

    const followUpToneResponse = await request(app)
      .post('/api/user/activation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'summary_followup_tone_selected',
        source: 'transcript_screen',
        outcome: 'friendly',
        step: 'followup_tone_selector',
        platform: 'android',
      });

    expect(followUpToneResponse.status).toBe(200);
    expect(followUpToneResponse.body.success).toBe(true);

    const followUpCrmExportResponse = await request(app)
      .post('/api/user/activation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'summary_followup_crm_export_tapped',
        source: 'transcript_screen',
        outcome: 'hubspot_copy',
        step: 'followup_crm_export',
        platform: 'android',
      });

    expect(followUpCrmExportResponse.status).toBe(200);
    expect(followUpCrmExportResponse.body.success).toBe(true);

    const followUpReminderResponse = await request(app)
      .post('/api/user/activation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'summary_followup_reminder_tapped',
        source: 'transcript_screen',
        outcome: 'cadence_48h',
        step: 'followup_reminder_cadence',
        platform: 'android',
      });

    expect(followUpReminderResponse.status).toBe(200);
    expect(followUpReminderResponse.body.success).toBe(true);

    const followUpResendResponse = await request(app)
      .post('/api/user/activation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'summary_followup_resend_tapped',
        source: 'transcript_screen',
        outcome: 'slack_48h',
        step: 'followup_resend',
        platform: 'android',
      });

    expect(followUpResendResponse.status).toBe(200);
    expect(followUpResendResponse.body.success).toBe(true);

    const followUpPersonaResponse = await request(app)
      .post('/api/user/activation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'summary_followup_persona_selected',
        source: 'transcript_screen',
        outcome: 'executive',
        step: 'followup_persona_selector',
        platform: 'android',
      });

    expect(followUpPersonaResponse.status).toBe(200);
    expect(followUpPersonaResponse.body.success).toBe(true);

    const followUpEscalationTappedResponse = await request(app)
      .post('/api/user/activation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'summary_followup_escalation_tapped',
        source: 'transcript_screen',
        outcome: 'enabled',
        step: 'followup_escalation_toggle',
        platform: 'android',
      });

    expect(followUpEscalationTappedResponse.status).toBe(200);
    expect(followUpEscalationTappedResponse.body.success).toBe(true);

    const followUpEscalationTriggeredResponse = await request(app)
      .post('/api/user/activation-events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventName: 'summary_followup_escalation_triggered',
        source: 'transcript_screen',
        outcome: 'slack_executive',
        step: 'followup_escalation_send',
        platform: 'android',
      });

    expect(followUpEscalationTriggeredResponse.status).toBe(200);
    expect(followUpEscalationTriggeredResponse.body.success).toBe(true);

    const metricsResponse = await request(app).get('/metrics');

    expect(metricsResponse.status).toBe(200);
    expect(metricsResponse.body.activation).toBeDefined();
    expect(metricsResponse.body.activation.total).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byEvent.onboarding_completed).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byEvent.summary_generate_completed).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byEvent.summary_followup_tone_selected).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byEvent.summary_followup_crm_export_tapped).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byEvent.summary_followup_reminder_tapped).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byEvent.summary_followup_resend_tapped).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byEvent.summary_followup_persona_selected).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byEvent.summary_followup_escalation_tapped).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byEvent.summary_followup_escalation_triggered).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.bySource.onboarding_screen).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.bySource.transcript_screen).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byOutcome.completed).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byOutcome.success).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byOutcome.friendly).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byOutcome.hubspot_copy).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byOutcome.cadence_48h).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byOutcome.slack_48h).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byOutcome.executive).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byOutcome.enabled).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byOutcome.slack_executive).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byStep.summary_ready).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byStep.followup_tone_selector).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byStep.followup_crm_export).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byStep.followup_reminder_cadence).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byStep.followup_resend).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byStep.followup_persona_selector).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byStep.followup_escalation_toggle).toBeGreaterThan(0);
    expect(metricsResponse.body.activation.byStep.followup_escalation_send).toBeGreaterThan(0);
    expect(
      metricsResponse.body.activation.byEventSource['summary_generate_completed|transcript_screen'],
    ).toBeGreaterThan(0);
    expect(Object.keys(metricsResponse.body.activation.byHour || {}).length).toBeGreaterThan(0);
  });
});
