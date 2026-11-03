import fs from 'node:fs';

const clientSource = fs.readFileSync('src/services/api.ts', 'utf8');
const serverSource = fs.readFileSync('src/server/api.ts', 'utf8');
const componentFiles: string[] = [];
function collectTsFiles(directory: string): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collectTsFiles(filePath);
    else if (/\.tsx?$/.test(entry.name)) componentFiles.push(filePath);
  }
}
collectTsFiles('src/components');
const normalize = (path: string) => path.split('?')[0]
  .replace(/\$\{this\.pageQuery\([^}]*\)\}/g, '')
  .replace(/\$\{([^}]+)\}/g, (_token, expression: string) => /^(q|params\.toString\(\))$/.test(expression.trim()) ? '' : ':param')
  .replace(/:[A-Za-z0-9_]+/g, ':param')
  .replace(/\/$/, '') || '/';

const clientRoutes = new Set<string>();
const requestPattern = /this\.request(?:<[^>]+>)?\(\s*(['`])([^'`]+)\1([\s\S]{0,1200}?)\);/g;
for (const match of clientSource.matchAll(requestPattern)) {
  const endpoint = normalize(match[2]);
  const method = match[3].match(/\bmethod\s*:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i)?.[1]?.toUpperCase() || 'GET';
  clientRoutes.add(`${method} ${endpoint}`);
}

const directFetchPattern = /fetch\(\s*(['`])([^'`]+)\1([\s\S]{0,600}?)\);/g;
for (const filePath of componentFiles) {
  const source = fs.readFileSync(filePath, 'utf8');
  for (const match of source.matchAll(directFetchPattern)) {
    if (!match[2].startsWith('/api/')) continue;
    const endpoint = normalize(match[2].replace(/^\/api/, ''));
    const method = match[3].match(/\bmethod\s*:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i)?.[1]?.toUpperCase() || 'GET';
    clientRoutes.add(`${method} ${endpoint}`);
  }
}

const serverRoutes = new Set<string>();
for (const match of serverSource.matchAll(/apiRouter\.(get|post|put|patch|delete)\(\s*'([^']+)'/gi)) {
  serverRoutes.add(`${match[1].toUpperCase()} ${normalize(match[2])}`);
}

const missing = [...clientRoutes].filter(route => !serverRoutes.has(route)).sort();
console.log(`Frontend method/path pairs: ${clientRoutes.size}; server route pairs: ${serverRoutes.size}; missing: ${missing.length}`);
for (const route of missing) console.log(`MISSING ${route}`);
if (missing.length) process.exitCode = 1;
