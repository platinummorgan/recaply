type AlertSeverity = 'warn' | 'error';

const ALERT_SEVERITY_PRIORITY: Record<AlertSeverity, number> = {
  warn: 30,
  error: 40,
};

const alertUrl = process.env.ALERT_WEBHOOK_URL || '';
const minSeverity = (process.env.ALERT_MIN_LEVEL || 'error').toLowerCase() as AlertSeverity;
const minPriority = ALERT_SEVERITY_PRIORITY[minSeverity] || ALERT_SEVERITY_PRIORITY.error;
const cooldownMs = parseInt(process.env.ALERT_COOLDOWN_MS || '60000', 10);

const lastSentByFingerprint = new Map<string, number>();

function shouldSendAlert(severity: AlertSeverity): boolean {
  if (!alertUrl || process.env.NODE_ENV === 'test') {
    return false;
  }
  return ALERT_SEVERITY_PRIORITY[severity] >= minPriority;
}

function buildFingerprint(title: string, context: Record<string, unknown>): string {
  const errorName = String(context.errorName || '');
  const statusCode = String(context.statusCode || '');
  return `${title}|${errorName}|${statusCode}`;
}

export async function sendAlert(
  severity: AlertSeverity,
  title: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  if (!shouldSendAlert(severity)) {
    return;
  }

  const now = Date.now();
  const fingerprint = buildFingerprint(title, context);
  const lastSent = lastSentByFingerprint.get(fingerprint) || 0;

  if (now - lastSent < cooldownMs) {
    return;
  }

  lastSentByFingerprint.set(fingerprint, now);

  const payload = {
    service: 'recaply-backend',
    environment: process.env.NODE_ENV || 'development',
    severity,
    title,
    timestamp: new Date(now).toISOString(),
    context,
  };

  try {
    await fetch(alertUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // Do not throw from alert pipeline; main request flow should continue.
  }
}

