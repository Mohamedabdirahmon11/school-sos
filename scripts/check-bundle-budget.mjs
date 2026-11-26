import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const distDir = path.resolve('dist');
const indexPath = path.join(distDir, 'index.html');
if (!statSync(distDir).isDirectory() || !statSync(indexPath).isFile()) {
  throw new Error('Bundle budget requires a completed Vite build in dist/.');
}

const html = readFileSync(indexPath, 'utf8');
const references = [...html.matchAll(/(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g)]
  .map(match => new URL(match[1], 'https://schoolos.invalid').pathname)
  .map(urlPath => path.join(distDir, urlPath.replace(/^\/+/, '')));
const uniqueReferences = [...new Set(references)].filter(file => file.startsWith(path.join(distDir, 'assets') + path.sep));
const initialJs = uniqueReferences.filter(file => file.endsWith('.js'));
const initialCss = uniqueReferences.filter(file => file.endsWith('.css'));

if (initialJs.length === 0) throw new Error('No initial JavaScript entry was found in dist/index.html.');

function measure(files) {
  const raw = files.reduce((sum, file) => sum + readFileSync(file).byteLength, 0);
  const compressed = files.reduce((sum, file) => sum + gzipSync(readFileSync(file), { level: 9 }).byteLength, 0);
  return { files: files.map(file => path.relative(distDir, file)), rawBytes: raw, gzipBytes: compressed };
}

function allFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? allFiles(fullPath) : [fullPath];
  });
}

const js = measure(initialJs);
const css = measure(initialCss);
const allAssets = allFiles(path.join(distDir, 'assets')).map(file => {
  const bytes = readFileSync(file);
  return { file: path.relative(distDir, file), rawBytes: bytes.byteLength, gzipBytes: gzipSync(bytes, { level: 9 }).byteLength };
}).sort((a, b) => b.gzipBytes - a.gzipBytes);

const budgets = {
  initialJsRawBytes: Number(process.env.BUNDLE_ENTRY_JS_MAX_RAW_KB || 900) * 1024,
  initialJsGzipBytes: Number(process.env.BUNDLE_ENTRY_JS_MAX_GZIP_KB || 320) * 1024,
  // Keep a modest raw-source ceiling while the compressed transfer budget remains the primary CSS guardrail.
  // Raw CSS includes the existing global design system; gzip remains the transfer-size guardrail.
  initialCssRawBytes: Number(process.env.BUNDLE_ENTRY_CSS_MAX_RAW_KB || 280) * 1024,
  initialCssGzipBytes: Number(process.env.BUNDLE_ENTRY_CSS_MAX_GZIP_KB || 60) * 1024
};

const report = { generatedAt: new Date().toISOString(), js, css, budgets, largestAssets: allAssets.slice(0, 20) };
writeFileSync(path.join(distDir, 'performance-bundle-report.json'), JSON.stringify(report, null, 2) + '\n');

const kb = bytes => (bytes / 1024).toFixed(1);
console.log(`Initial JS: ${kb(js.rawBytes)} KiB raw / ${kb(js.gzipBytes)} KiB gzip (budget ${kb(budgets.initialJsRawBytes)} / ${kb(budgets.initialJsGzipBytes)} KiB)`);
console.log(`Initial CSS: ${kb(css.rawBytes)} KiB raw / ${kb(css.gzipBytes)} KiB gzip (budget ${kb(budgets.initialCssRawBytes)} / ${kb(budgets.initialCssGzipBytes)} KiB)`);
console.log('Largest compressed assets:');
for (const asset of allAssets.slice(0, 10)) console.log(`  ${kb(asset.gzipBytes)} KiB gzip  ${asset.file}`);

const failures = [];
if (js.rawBytes > budgets.initialJsRawBytes) failures.push('initial JS raw size');
if (js.gzipBytes > budgets.initialJsGzipBytes) failures.push('initial JS gzip size');
if (css.rawBytes > budgets.initialCssRawBytes) failures.push('initial CSS raw size');
if (css.gzipBytes > budgets.initialCssGzipBytes) failures.push('initial CSS gzip size');
if (failures.length) {
  console.error(`Bundle budget exceeded: ${failures.join(', ')}`);
  process.exitCode = 1;
}
