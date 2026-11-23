import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig({
  testDir: '.',
  testMatch: ['teacher-portal.visual.spec.ts', 'school-setup.visual.spec.ts', 'student-portal.visual.spec.ts', 'parent-portal.visual.spec.ts', 'login.visual.spec.ts'],
  outputDir: path.join(root, 'artifacts', 'playwright-results'),
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { browserName: 'chromium', headless: true, viewport: { width: 1280, height: 900 } },
  webServer: {
    command: 'npx vite --config vite.visual.config.ts --host 127.0.0.1 --port 4173',
    cwd: root,
    url: 'http://127.0.0.1:4173/teacher-portal-visual.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
