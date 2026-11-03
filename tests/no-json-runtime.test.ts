import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const runtimeExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return runtimeExtensions.has(path.extname(entry.name)) ? [target] : [];
  }));
  return nested.flat();
}

test('runtime source does not import or read data/db.json', async () => {
  const files = [...await sourceFiles(path.join(root, 'src')), path.join(root, 'server.ts')];
  const forbiddenReference = /data[\\/]+db\.json|(?:readFile|readFileSync|createReadStream)\s*\([^)]*db\.json/i;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.equal(forbiddenReference.test(source), false, `Runtime data/db.json access found in ${path.relative(root, file)}`);
  }
});
