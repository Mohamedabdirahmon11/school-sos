import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const widths = [360, 390, 768, 1280];
const themes = ['light', 'dark'] as const;
const steps = [
  'Macluumaadka dugsiga', 'Sanad dugsiyeed & Terms', 'Fasallada',
  'Maaddooyinka (Curriculum)', 'Macallimiinta', 'Teacher Assignment',
  'Ardayda', 'Timetable', 'Dhammee & Fur Dashboard'
];

for (const width of widths) {
  for (const theme of themes) {
    test(`School Setup Wizard · ${width}px · ${theme}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme });
      const page = await context.newPage();
      page.on('pageerror', error => console.log('[setup visual pageerror]', error.stack || error.message));
      await page.goto(`http://127.0.0.1:4173/teacher-portal-visual.html?component=setup&theme=${theme}`);
      await expect(page.locator('.school-setup-reference')).toBeVisible();
      await expect(page.getByText('Setup Wizard', { exact: true })).toBeVisible();
      const folder = path.join(root, 'artifacts', 'school-setup', theme, String(width));
      fs.mkdirSync(folder, { recursive: true });
      const pageLinks: string[] = [];
      for (let index = 0; index < steps.length; index += 1) {
        const nav = page.getByRole('navigation', { name: 'Tallaabooyinka' });
        await nav.getByRole('button', { name: new RegExp(steps[index].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
        await expect(page.locator('.sw-main h2')).toHaveText(steps[index]);
        const imageName = `step-${index + 1}.png`;
        await page.screenshot({ path: path.join(folder, imageName), fullPage: true });
        pageLinks.push(`<li><a href="${imageName}">${steps[index]}</a></li>`);
      }
      fs.writeFileSync(path.join(folder, 'index.html'), `<!doctype html><meta charset="utf-8"><title>School Setup ${width}px ${theme}</title><h1>School Setup · ${width}px · ${theme}</h1><ol>${pageLinks.join('')}</ol>`);
      await context.close();
    });
  }
}

test('School Setup Wizard screenshot matrix index', async () => {
  const folder = path.join(root, 'artifacts', 'school-setup');
  fs.mkdirSync(folder, { recursive: true });
  const links = themes.flatMap(theme => widths.map(width => `<li><a href="${theme}/${width}/">${width}px · ${theme}</a></li>`)).join('');
  fs.writeFileSync(path.join(folder, 'index.html'), `<!doctype html><meta charset="utf-8"><title>School Setup Wizard screenshot matrix</title><style>body{font:16px system-ui;margin:40px;background:#f6f4ee;color:#1c2b26}li{margin:12px 0}a{color:#1f4d3f;font-weight:700}</style><h1>School Setup Wizard · responsive matrix</h1><p>9 steps × 4 viewport widths × 2 themes. PNG files are grouped by theme and width.</p><ul>${links}</ul>`);
  expect(fs.existsSync(path.join(folder, 'index.html'))).toBeTruthy();
});
