import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const widths = [360, 390, 768, 1280];
const themes = ['light', 'dark'];

for (const width of widths) for (const theme of themes) {
  test('Portal login and child switcher screenshots · ' + width + 'px · ' + theme, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme as 'light' | 'dark' });
    const page = await context.newPage();
    page.on('pageerror', error => console.log('[portal-login pageerror]', error.stack || error.message));
    const folder = path.join(process.cwd(), 'artifacts', 'portal-login', theme, String(width));
    fs.mkdirSync(folder, { recursive: true });

    await page.goto('http://127.0.0.1:4173/login-visual.html?component=login&theme=' + theme);
    await page.getByRole('button', { name: 'Arday / Waalid' }).click();
    await expect(page.getByRole('tab', { name: 'Arday' })).toBeVisible();
    await page.screenshot({ path: path.join(folder, 'student-login.png'), fullPage: true });
    await page.getByRole('tab', { name: 'Waalid' }).click();
    await expect(page.getByText('Parent phone number')).toBeVisible();
    await page.screenshot({ path: path.join(folder, 'parent-login.png'), fullPage: true });

    await page.goto('http://127.0.0.1:4173/login-visual.html?component=login&mode=pin-change&theme=' + theme);
    await page.getByRole('button', { name: 'Arday / Waalid' }).click();
    await page.getByPlaceholder('e.g. MOG01').fill('TEST01');
    await page.getByPlaceholder('e.g. ST-0421').fill('ST-0421');
    await page.getByPlaceholder('6-digit PIN').fill('654321');
    await page.getByRole('button', { name: 'Sign in to Platform' }).click();
    await expect(page.getByText('Change your temporary PIN')).toBeVisible();
    await page.screenshot({ path: path.join(folder, 'change-pin.png'), fullPage: true });

    await page.goto('http://127.0.0.1:4173/login-visual.html?component=parent&theme=' + theme);
    await expect(page.getByRole('heading', { name: 'Dooro ilmaha' })).toBeVisible();
    await expect(page.getByText('Ayaan Test Student')).toBeVisible();
    await page.screenshot({ path: path.join(folder, 'child-switcher.png'), fullPage: true });
    await context.close();
  });
}
