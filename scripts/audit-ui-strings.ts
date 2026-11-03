import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src/components');
const files: string[] = [];
function walk(directory: string) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(tsx|jsx)$/.test(entry.name)) files.push(target);
  }
}
walk(root);
let flagged = 0;
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const textNodes = [...source.matchAll(/>([^<>{}\n][^<>{}]*)</g)].filter(match => /[A-Za-z\u1200-\u137F]/.test(match[1].trim()));
  const literalAttributes = [...source.matchAll(/\b(?:placeholder|title|aria-label)\s*=\s*"[^"]*[A-Za-z][^"]*"/g)];
  const count = textNodes.length + literalAttributes.length;
  if (count) {
    flagged += 1;
    console.log(`${path.relative(process.cwd(), file)}: ${count} possible hard-coded UI strings`);
  }
}
console.log(`${flagged} component files flagged out of ${files.length}. Review matches manually; this heuristic can include examples and false positives.`);
