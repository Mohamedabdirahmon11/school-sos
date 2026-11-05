import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('student profile updates cannot attach another school transport route', () => {
  const source = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const start = source.indexOf("apiRouter.put('/students/:id'");
  const end = source.indexOf("apiRouter.delete('/students/:id'", start);
  const route = source.slice(start, end);
  assert.match(route, /db\.getTransportRoutes\(school\.id\)/);
  assert.match(route, /routes\.some\(route => route\.id === payload\.busRouteId/);
  assert.match(route, /Bus route does not belong to this school/);
  assert.match(route, /db\.updateStudent\(req\.params\.id, payload, school\.id\)/);
});

test('student documents and notes are bounded and validated before persistence', () => {
  const source = readFileSync(new URL('../src/server/api.ts', import.meta.url), 'utf8');
  const start = source.indexOf("apiRouter.put('/students/:id'");
  const end = source.indexOf("apiRouter.delete('/students/:id'", start);
  const route = source.slice(start, end);
  assert.match(route, /payload\.documents\.length > 50/);
  assert.match(route, /payload\.notes\.length > 100/);
  assert.match(route, /document\.url\.length > 2048/);
  assert.match(route, /note\.text\.length > 2000/);
  assert.match(route, /\^javascript:/);
});
