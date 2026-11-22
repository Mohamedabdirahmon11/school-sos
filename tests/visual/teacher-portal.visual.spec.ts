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
      await context.close();
    });
  }
}
