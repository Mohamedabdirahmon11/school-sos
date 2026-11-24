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

/**
 * Only Vite's content-hashed assets are immutable. HTML and unhashed public
 * files must revalidate so a deployment can never pin an old app shell.
 */
export function productionAssetCacheControl(relativePath: string): string {
  let normalized = relativePath.split(path.sep).join('/');
  while (normalized.startsWith('/')) normalized = normalized.slice(1);
  const filename = normalized.split('/').pop() || '';
  const extensionIndex = filename.lastIndexOf('.');
  const hashSeparator = filename.lastIndexOf('-', extensionIndex);
  const hash = hashSeparator >= 0 && extensionIndex > hashSeparator
    ? filename.slice(hashSeparator + 1, extensionIndex)
    : '';
  const isHashedAsset = normalized.startsWith('assets/')
    && hash.length >= 8
    && /^[a-zA-Z0-9_-]+$/.test(hash);
  return isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache';
}
