/**
 * Server entry point for SchoolOS Multi-School SaaS
 * Mounts Express API routes on /api and delegates UI requests to Vite middlewares.
 * The HTTP listener starts before database initialization so transient Supabase
 * outages do not make the whole application unreachable.
 */

import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './src/server/api.ts';
import { apiErrorHandler } from './src/server/async-errors.ts';
import { apiNotFound, createLoginRateLimiter, getTrustProxyHops, securityHeaders } from './src/server/security-middleware.ts';
import { assertProductionAssets, productionAssetCacheControl } from './src/server/production-assets.ts';
import { db, initializeStorage } from './src/server/storage.ts';
import path from 'node:path';

if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

async function startServer() {
  const requiredEnv = ['SESSION_SECRET', 'SUPER_ADMIN_EMAIL', 'SUPER_ADMIN_PASSWORD', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missingEnv = requiredEnv.filter(name => !process.env[name]?.trim());
  if (missingEnv.length) {
    throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}. Set them in .env before starting SchoolOS.`);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(process.cwd(), 'dist');
  if (isProduction) assertProductionAssets(distPath);

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  let isReady = false;

  app.disable('x-powered-by');
  app.set('trust proxy', getTrustProxyHops(process.env.NODE_ENV, process.env.TRUST_PROXY_HOPS));
  app.use(securityHeaders);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use('/api/auth/login', createLoginRateLimiter({ windowMs: 60_000, max: 30 }));

  // Liveness stays healthy while Supabase is starting or temporarily unavailable.
  // Readiness is separate so orchestrators can distinguish a live process from
  // an application that is not yet safe to serve database-backed requests.
  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      status: isReady ? 'ok' : 'starting',
      server: 'ok',
      database: isReady ? 'connected' : 'initializing',
      ready: isReady,
      time: new Date().toISOString()
    });
  });
  app.get('/api/ready', (_req, res) => {
    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'not_ready',
      ready: isReady,
      time: new Date().toISOString()
    });
  });

  app.use('/api', (_req, res, next) => {
    if (!isReady) {
      res.setHeader('Retry-After', '5');
      res.status(503).json({ error: 'SchoolOS is starting or reconnecting to its database. Please retry shortly.', code: 'SERVICE_STARTING' });
      return;
    }
    next();
  });

  app.use('/api', apiRouter);
  app.use(apiErrorHandler);
  app.use('/api', apiNotFound);

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath, {
      setHeaders(res, filePath) {
        res.setHeader('Cache-Control', productionAssetCacheControl(path.relative(distPath, filePath)));
      }
    }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Start accepting HTTP traffic first. This keeps the UI and health endpoints
  // reachable even if Supabase has a temporary outage during deployment.
  await new Promise<void>((resolve, reject) => {
    const server = app.listen(PORT, '0.0.0.0', () => resolve());
    server.once('error', reject);
  });
  console.log(`🚀 SchoolOS Full-Stack Server running at http://0.0.0.0:${PORT}`);

  const runDailySubscriptionCheck = async () => {
    const context = await db.prepareRequestContext();
    await db.runWithRequestContext(context, () => db.runSubscriptionDailyCheck());
  };

  const publishDueBroadcasts = async () => {
    const context = await db.prepareRequestContext(false, 'broadcast-scheduler', false);
    const published = await db.runWithRequestContext(context, () => db.publishDueBroadcasts());
    if (published > 0) console.info(`[broadcast-scheduler] published=${published}`);
  };

  // Retry transient startup/database failures with bounded exponential backoff.
  // A schema/configuration problem remains visible in /api/ready and server logs,
  // but no longer causes the HTTP process to exit and become unreachable.
  let attempt = 0;
  while (!isReady) {
    try {
      await initializeStorage();
      const health = await db.checkSupabaseHealth();
      if (!health.ok) throw new Error('Supabase health check failed.');
      isReady = true;
      console.info(`[supabase-startup] connectivity=ok roundTrip=${health.roundTripMs}ms`);
    } catch (error) {
      attempt += 1;
      const delay = Math.min(30_000, 1_000 * (2 ** Math.min(attempt - 1, 5)));
      const message = error instanceof Error ? error.message : 'unknown startup error';
      console.error(`[startup] database initialization attempt ${attempt} failed: ${message}; retrying in ${delay}ms`);
      await sleep(delay);
    }
  }

  // Background maintenance must never take down the HTTP server or prevent it
  // from serving normal requests after the database has become ready.
  void runDailySubscriptionCheck().catch(error => {
    console.error(`[subscription-scheduler] initial check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  });
  const subscriptionTimer = setInterval(() => {
    void runDailySubscriptionCheck().catch(error => {
      console.error(`[subscription-scheduler] daily check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
  }, 24 * 60 * 60 * 1000);
  subscriptionTimer.unref();

  let broadcastCheckInFlight = false;
  const runDueBroadcastCheck = async () => {
    if (broadcastCheckInFlight) return;
    broadcastCheckInFlight = true;
    try {
      await publishDueBroadcasts();
    } finally {
      broadcastCheckInFlight = false;
    }
  };
  void runDueBroadcastCheck().catch(error => {
    console.error(`[broadcast-scheduler] initial check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  });
  const broadcastTimer = setInterval(() => {
    void runDueBroadcastCheck().catch(error => {
      console.error(`[broadcast-scheduler] scheduled check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
  }, 60 * 1000);
  broadcastTimer.unref();
}

process.on('unhandledRejection', reason => {
  console.error(`[unhandled-rejection] ${reason instanceof Error ? reason.message : 'unknown rejection'}`);
});

startServer().catch(err => {
  console.error(`Failed to start SchoolOS: ${err instanceof Error ? err.message : 'unknown startup error'}`);
  process.exit(1);
});
