import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { logger } from '../services/logger';
import { observeRequest } from '../services/metrics';
import { withRequestLogContext } from '../services/requestLogContext';

export function requestContext(req: Request, res: Response, next: NextFunction) {
  const requestId = randomUUID();
  const startMs = Date.now();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  withRequestLogContext({ requestId }, () => {
    res.on('finish', () => {
      const durationMs = Date.now() - startMs;
      const path = req.originalUrl || req.url;

      observeRequest({
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs,
      });

      logger.info('request_completed', {
        requestId,
        method: req.method,
        path: path.split('?')[0],
        statusCode: res.statusCode,
        durationMs,
        userId: req.userId,
      });
    });

    next();
  });
}
