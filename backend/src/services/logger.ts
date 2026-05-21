import { getRequestLogContext } from './requestLogContext';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const configuredLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
const minLevel = LOG_LEVEL_PRIORITY[configuredLevel] || LOG_LEVEL_PRIORITY.info;

function canLog(level: LogLevel): boolean {
  if (process.env.NODE_ENV === 'test') {
    return false;
  }
  return LOG_LEVEL_PRIORITY[level] >= minLevel;
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (!error) {
    return {};
  }

  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorName: error.name,
      errorStack: error.stack,
    };
  }

  if (typeof error === 'object') {
    return { errorObject: error };
  }

  return { errorValue: String(error) };
}

function write(level: LogLevel, message: string, fields: Record<string, unknown> = {}) {
  if (!canLog(level)) {
    return;
  }

  const context = getRequestLogContext();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
    ...fields,
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
};
