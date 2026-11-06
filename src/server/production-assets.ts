import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Fail fast when a production deployment has not produced a complete Vite build.
 * Starting an API-only process without index.html would otherwise look healthy
 * while every browser request fails to load the SchoolOS application.
 */
export function assertProductionAssets(distPath: string): void {
  const indexPath = path.join(distPath, 'index.html');
  if (
    !existsSync(distPath) ||
    !statSync(distPath).isDirectory() ||
    !existsSync(indexPath) ||
    !statSync(indexPath).isFile()
  ) {
    throw new Error(
      `Production frontend build is missing or incomplete at "${distPath}". Run "npm run build" before "npm start".`
    );
  }
}
