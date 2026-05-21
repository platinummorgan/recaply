import { AsyncLocalStorage } from 'async_hooks';

export interface RequestLogContext {
  requestId?: string;
  userId?: string;
  userEmail?: string;
  [key: string]: unknown;
}

const requestLogContextStorage = new AsyncLocalStorage<RequestLogContext>();

export function withRequestLogContext<T>(context: RequestLogContext, callback: () => T): T {
  return requestLogContextStorage.run({ ...context }, callback);
}

export function updateRequestLogContext(context: RequestLogContext): void {
  const store = requestLogContextStorage.getStore();
  if (!store) {
    return;
  }

  Object.entries(context).forEach(([key, value]) => {
    if (value !== undefined) {
      (store as Record<string, unknown>)[key] = value;
    }
  });
}

export function getRequestLogContext(): RequestLogContext {
  return requestLogContextStorage.getStore() || {};
}
