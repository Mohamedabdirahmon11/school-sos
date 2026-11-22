import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const referenceUrl = pathToFileURL(path.join(root, 'tests/fixtures/teacher-portal-reference.html')).href;
const sections = ['dashboard', 'timetable', 'students', 'attendance', 'marks', 'homework', 'notices', 'messages', 'payslip', 'profile'];
const viewports = [360, 390, 768, 1280];
const themes = ['light', 'dark'];

for (const width of viewports) {
  for (const theme of themes) {
    test(`reference and live Teacher Portal sections · ${width}px · ${theme}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme as 'light' | 'dark' });
      const reference = await context.newPage();
      const live = await context.newPage();
      const folder = path.join(root, 'artifacts', 'teacher-portal', theme, String(width));
      fs.mkdirSync(path.join(folder, 'reference'), { recursive: true });
      fs.mkdirSync(path.join(folder, 'schoolos'), { recursive: true });
      for (const section of sections) {
        await reference.goto(`${referenceUrl}#${section}`);
        await reference.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
        if (theme === 'dark') await reference.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        else await reference.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
        await expect(reference.locator('#view')).toBeVisible();
        await reference.screenshot({ path: path.join(folder, 'reference', `${section}.png`), fullPage: true });

        await live.goto(`http://127.0.0.1:4173/teacher-portal-visual.html?section=${section}&theme=${theme}`);
        await expect(live.locator('#root')).toBeVisible();
        await expect(live.locator('h1, h2').first()).toBeVisible();
        await live.screenshot({ path: path.join(folder, 'schoolos', `${section}.png`), fullPage: true });
      }
      const pairs = sections.map(section => `<section><h2>${section}</h2><div class="pair"><figure><figcaption>teacher-portal.html</figcaption><img src="reference/${section}.png"></figure><figure><figcaption>SchoolOS component</figcaption><img src="schoolos/${section}.png"></figure></div></section>`).join('');
      fs.writeFileSync(path.join(folder, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Teacher Portal comparison · ${width}px · ${theme}</title><style>body{font:14px system-ui;margin:24px;background:#eef2f7;color:#17212b}h1{margin-bottom:24px}section{margin:0 0 32px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;background:white;padding:10px;border:1px solid #ccd4df;border-radius:10px}figcaption{font-weight:700;margin:0 0 8px}img{width:100%;height:auto;border:1px solid #e2e8f0}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>Reference vs SchoolOS · ${width}px · ${theme}</h1>${pairs}`);
      await context.close();
    });
  }
}
