import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const referenceUrl = pathToFileURL(path.join(root, 'tests/fixtures/people-admin-reference.html')).href;
const views = [
  { tab: 'teachers', section: 'teachers', title: 'Macallimiinta' },
  { tab: 'parents', section: 'parents', title: 'Waalidka & Xiriirada' },
  { tab: 'adm', section: 'admissions', title: 'Admissions Pipeline' },
  { tab: 'roles', section: 'roles', title: 'Staff Roles & Permissions' }
];
const viewports = [360, 390, 768, 1280];
const themes = ['light', 'dark'];

for (const width of viewports) {
  for (const theme of themes) {
    test('People Admin HTML reference comparison · ' + width + 'px · ' + theme, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme as 'light' | 'dark' });
      const reference = await context.newPage();
      const live = await context.newPage();
      const errors: string[] = [];
      live.on('pageerror', error => errors.push(error.stack || error.message));
      live.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      const folder = path.join(root, 'artifacts', 'people-admin', theme, String(width));
      fs.mkdirSync(path.join(folder, 'reference'), { recursive: true });
      fs.mkdirSync(path.join(folder, 'schoolos'), { recursive: true });

      for (const view of views) {
        await reference.goto(referenceUrl + '?theme=' + theme);
        await reference.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
        await reference.locator('#nav [data-tab="' + view.tab + '"]').click();
        await expect(reference.locator('#main h1')).toBeVisible();
        await reference.locator('#main').screenshot({ path: path.join(folder, 'reference', view.section + '.png') });

        await live.goto('http://127.0.0.1:4173/teacher-portal-visual.html?component=people-admin&section=' + view.section + '&theme=' + theme);
        await expect(live.locator('.school-people-page h1')).toBeVisible();
        await live.locator('.school-people-page').screenshot({ path: path.join(folder, 'schoolos', view.section + '.png') });
      }

      expect(errors, 'People Admin browser errors').toEqual([]);
      const pairs = views.map(view => '<section><h2>' + view.title + '</h2><div class="pair"><figure><figcaption>Supplied HTML reference</figcaption><img src="reference/' + view.section + '.png"></figure><figure><figcaption>SchoolOS React view</figcaption><img src="schoolos/' + view.section + '.png"></figure></div></section>').join('');
      fs.writeFileSync(path.join(folder, 'index.html'), '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>People Admin comparison</title><style>body{font:14px system-ui;margin:24px;background:#eef2f7;color:#17212b}section{margin:0 0 32px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;background:white;padding:10px;border:1px solid #ccd4df;border-radius:10px}figcaption{font-weight:700;margin:0 0 8px}img{width:100%;height:auto;border:1px solid #e2e8f0}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>People Admin · Reference vs SchoolOS · ' + width + 'px · ' + theme + '</h1>' + pairs);
      await context.close();
    });
  }
}

test('write People Admin screenshot comparison overview', async () => {
  const folder = path.join(root, 'artifacts', 'people-admin');
  fs.mkdirSync(folder, { recursive: true });
  const links = themes.flatMap(theme => viewports.map(width => '<li><a href="' + theme + '/' + width + '/index.html">' + width + 'px · ' + theme + '</a></li>')).join('');
  fs.writeFileSync(path.join(folder, 'index.html'), '<!doctype html><meta charset="utf-8"><title>People Admin visual matrix</title><h1>People Admin · supplied HTML and SchoolOS</h1><p>4 modules × 4 viewport widths × 2 themes.</p><ul>' + links + '</ul>');
  expect(fs.existsSync(path.join(folder, 'index.html'))).toBeTruthy();
});
