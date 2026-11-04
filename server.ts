/**
 * Server entry point for SchoolOS Multi-School SaaS
 * Mounts Express API routes on /api and delegates UI requests to Vite middlewares
 */

import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './src/server/api.ts';
import { apiErrorHandler } from './src/server/async-errors.ts';
import { apiNotFound, createLoginRateLimiter, getTrustProxyHops, securityHeaders } from './src/server/security-middleware.ts';
import { assertProductionAssets } from './src/server/production-assets.ts';
import { startNotificationWorker } from './src/server/notification-worker.ts';
import { db, initializeStorage } from './src/server/storage.ts';
import path from 'node:path';

if (process.argv.includes('--production')) process.env.NODE_ENV = 'production';

async function startServer() {
  const requiredEnv = ['SESSION_SECRET', 'SUPER_ADMIN_EMAIL', 'SUPER_ADMIN_PASSWORD', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missingEnv = requiredEnv.filter(name => !process.env[name]?.trim());
  if (missingEnv.length) {
    throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}. Set them in .env before starting SchoolOS.`);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const distPath = path.resolve(process.cwd(), 'dist');
  if (isProduction) assertProductionAssets(distPath);

  await initializeStorage();
  if (isProduction) startNotificationWorker();
  const supabaseRoundTrip = await db.checkSupabaseHealth();
  if (!supabaseRoundTrip.ok) throw new Error('Supabase health check failed during startup. Verify Supabase connectivity and schema access.');
  console.info(`[supabase-startup] connectivity=ok roundTrip=${supabaseRoundTrip.roundTripMs}ms`);

  const runDailySubscriptionCheck = async () => {
    const context = await db.prepareRequestContext();
    await db.runWithRequestContext(context, () => db.runSubscriptionDailyCheck());
  };
  await runDailySubscriptionCheck();
  const subscriptionTimer = setInterval(() => {
    void runDailySubscriptionCheck().catch(() => console.error('Daily subscription check failed.'));
  }, 24 * 60 * 60 * 1000);
  subscriptionTimer.unref();

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.disable('x-powered-by');
  app.set('trust proxy', getTrustProxyHops(process.env.NODE_ENV, process.env.TRUST_PROXY_HOPS));
  app.use(securityHeaders);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());
  app.use('/api/auth/login', createLoginRateLimiter({ windowMs: 60_000, max: 30 }));

  // Mount API endpoints
  app.use('/api', apiRouter);
  app.use(apiErrorHandler);

  // Health check endpoint
  app.get('/api/health', async (_req, res) => {
    try {
      const health = await db.checkSupabaseHealth();
      res.status(health.ok ? 200 : 503).json({ status: health.ok ? 'ok' : 'unavailable', supabase: health.ok ? 'connected' : 'unavailable', roundTripMs: health.roundTripMs, time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'unavailable', supabase: 'unavailable', time: new Date().toISOString() });
    }
  });
  app.use('/api', apiNotFound);

  if (!isProduction) {
    // Development mode: Vite middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Production mode: the complete frontend build was validated before database initialization.
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SchoolOS Full-Stack Server running at http://0.0.0.0:${PORT}`);
  });
}

process.on('unhandledRejection', reason => {
  console.error(`[unhandled-rejection] ${reason instanceof Error ? reason.message : 'unknown rejection'}`);
});

startServer().catch(err => {
  console.error(`Failed to start SchoolOS: ${err instanceof Error ? err.message : 'unknown startup error'}`);
  process.exit(1);
});
