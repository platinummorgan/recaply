import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { requestContext } from './middleware/requestContext';
import { logger, serializeError } from './services/logger';
import { getMetricsSnapshot, incrementErrors, incrementRateLimited } from './services/metrics';
import { sendAlert } from './services/alerting';
import {
  getGrowthRollupMaintenanceHistory,
  recordGrowthRollupMaintenanceRun,
  runGrowthRollupContinuityMaintenance,
} from './services/supabase';

// Routes
import authRoutes from './routes/auth';
import audioRoutes from './routes/audio';
import subscriptionRoutes from './routes/subscription';
import userRoutes from './routes/user';
import purchasesRoutes from './routes/purchases';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000');

// Trust proxy - required for Railway/cloud deployments
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(requestContext);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    incrementRateLimited();
    logger.warn('rate_limit_exceeded', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      ip: req.ip,
    });

    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      requestId: req.requestId,
    });
  },
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    requestId: req.requestId,
  });
});

app.get('/metrics', async (req, res) => {
  const requiredKey = process.env.METRICS_API_KEY;
  const providedKey = req.header('x-metrics-key');

  if (requiredKey && providedKey !== requiredKey) {
    return res.status(403).json({
      error: 'Forbidden',
      requestId: req.requestId,
    });
  }

  try {
    const requestedWindowDays = Number(req.query.windowDays);
    const windowDays = Number.isFinite(requestedWindowDays)
      ? Math.min(30, Math.max(1, Math.floor(requestedWindowDays)))
      : 7;
    const snapshot = await getMetricsSnapshot(windowDays);
    res.json(snapshot);
  } catch (error: any) {
    logger.error('metrics_snapshot_failed', {
      requestId: req.requestId,
      ...serializeError(error),
    });
    res.status(500).json({
      error: 'Failed to load metrics snapshot',
      requestId: req.requestId,
    });
  }
});

app.post('/metrics/growth-rollups/maintenance', async (req, res) => {
  const requiredKey = process.env.METRICS_API_KEY;
  const providedKey = req.header('x-metrics-key');

  if (requiredKey && providedKey !== requiredKey) {
    return res.status(403).json({
      error: 'Forbidden',
      requestId: req.requestId,
    });
  }

  try {
    const rawMaxBackfillDays = req.body?.maxBackfillDays ?? req.query.maxBackfillDays;
    const numericMaxBackfillDays = Number(rawMaxBackfillDays);
    const maxBackfillDays = Number.isFinite(numericMaxBackfillDays)
      ? Math.min(3650, Math.max(1, Math.floor(numericMaxBackfillDays)))
      : undefined;
    const dryRun = Boolean(req.body?.dryRun);
    const includeCompaction = req.body?.includeCompaction !== false;

    const summary = await runGrowthRollupContinuityMaintenance({
      maxBackfillDays,
      dryRun,
      includeCompaction,
    });

    void recordGrowthRollupMaintenanceRun({
      requestId: req.requestId,
      summary,
      dryRun,
      maxBackfillDays: summary.maxBackfillDays,
      includeCompaction,
    });

    logger.info('metrics_growth_rollup_maintenance_completed', {
      requestId: req.requestId,
      persistenceEnabled: summary.persistenceEnabled,
      available: summary.available,
      dryRun: summary.dryRun,
      maxBackfillDays: summary.maxBackfillDays,
      backfillRowsWritten: summary.backfill.rowsWritten,
      legacyRowsDeleted: summary.compaction.legacyRowsDeleted,
    });

    res.json(summary);
  } catch (error: any) {
    const rawMaxBackfillDays = req.body?.maxBackfillDays ?? req.query.maxBackfillDays;
    const numericMaxBackfillDays = Number(rawMaxBackfillDays);
    const maxBackfillDays = Number.isFinite(numericMaxBackfillDays)
      ? Math.min(3650, Math.max(1, Math.floor(numericMaxBackfillDays)))
      : 365;
    const dryRun = Boolean(req.body?.dryRun);
    const includeCompaction = req.body?.includeCompaction !== false;
    void recordGrowthRollupMaintenanceRun({
      requestId: req.requestId,
      summary: null,
      dryRun,
      maxBackfillDays,
      includeCompaction,
      error,
    });

    logger.error('metrics_growth_rollup_maintenance_failed', {
      requestId: req.requestId,
      ...serializeError(error),
    });
    res.status(500).json({
      error: 'Failed to run growth rollup maintenance',
      requestId: req.requestId,
    });
  }
});

app.get('/metrics/growth-rollups/maintenance-runs', async (req, res) => {
  const requiredKey = process.env.METRICS_API_KEY;
  const providedKey = req.header('x-metrics-key');

  if (requiredKey && providedKey !== requiredKey) {
    return res.status(403).json({
      error: 'Forbidden',
      requestId: req.requestId,
    });
  }

  try {
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, Math.floor(requestedLimit)))
      : 12;
    const history = await getGrowthRollupMaintenanceHistory(limit);
    res.json(history);
  } catch (error: any) {
    logger.error('metrics_growth_rollup_maintenance_history_failed', {
      requestId: req.requestId,
      ...serializeError(error),
    });
    res.status(500).json({
      error: 'Failed to load growth rollup maintenance history',
      requestId: req.requestId,
    });
  }
});

// Serve docs - files are at backend/docs/ in the repo
app.use('/docs', express.static('docs'));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/audio', audioRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/user', userRoutes);
app.use('/api/purchases', purchasesRoutes);

// 404 handler
app.use((req, res) => {
  logger.warn('route_not_found', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl || req.url,
  });

  res.status(404).json({
    error: 'Route not found',
    requestId: req.requestId,
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  incrementErrors();

  const errorContext = {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode: err.status || 500,
    ...serializeError(err),
  };

  logger.error('unhandled_error', errorContext);
  void sendAlert('error', 'Unhandled backend error', errorContext);

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    requestId: req.requestId,
  });
});

export function startServer() {
  process.on('unhandledRejection', (reason: unknown) => {
    const context = {
      event: 'unhandledRejection',
      ...serializeError(reason),
    };
    logger.error('process_unhandled_rejection', context);
    void sendAlert('error', 'Process unhandled rejection', context);
  });

  process.on('uncaughtException', (error: Error) => {
    const context = {
      event: 'uncaughtException',
      ...serializeError(error),
    };
    logger.error('process_uncaught_exception', context);
    void sendAlert('error', 'Process uncaught exception', context);
  });

  return app.listen(PORT, '0.0.0.0', () => {
    logger.info('server_started', {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      healthEndpoint: `http://0.0.0.0:${PORT}/health`,
      metricsEndpoint: `http://0.0.0.0:${PORT}/metrics`,
    });
  });
}

if (require.main === module) {
  startServer();
}

export default app;
