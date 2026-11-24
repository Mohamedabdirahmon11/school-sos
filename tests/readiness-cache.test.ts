import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SchoolReadinessCache } from '../src/server/readiness-cache.ts';

test('readiness cache deduplicates concurrent loads per school, not across schools', async () => {
  const cache = new SchoolReadinessCache<number>(30_000);
  let calls = 0;
  const load = async () => { calls += 1; return calls; };

  const [first, second, otherSchool] = await Promise.all([
    cache.get('school-a', load),
    cache.get('school-a', load),
    cache.get('school-b', load)
  ]);

  assert.equal(first, 1);
  assert.equal(second, 1);
  assert.equal(otherSchool, 2);
  assert.equal(calls, 2);
});

test('readiness cache expires after its short TTL', async () => {
  let now = 1_000;
  const cache = new SchoolReadinessCache<number>(30, () => now);
  let calls = 0;
  const load = async () => ++calls;

  assert.equal(await cache.get('school-a', load), 1);
  assert.equal(await cache.get('school-a', load), 1);
  now += 31;
  assert.equal(await cache.get('school-a', load), 2);
  assert.equal(calls, 2);
});

test('assignment mutation invalidation forces the next readiness check to reload', async () => {
  const cache = new SchoolReadinessCache<{ assigned: boolean }>(30_000);
  let assignmentReady = false;
  const load = async () => ({ assigned: assignmentReady });

  assert.deepEqual(await cache.get('school-a', load), { assigned: false });
  assignmentReady = true;
  cache.invalidate('school-a');
  assert.deepEqual(await cache.get('school-a', load), { assigned: true });
});

test('failed readiness loads are not retained in the cache', async () => {
  const cache = new SchoolReadinessCache<number>(30_000);
  let calls = 0;
  await assert.rejects(cache.get('school-a', async () => {
    calls += 1;
    throw new Error('temporary database failure');
  }), /temporary database failure/);

  assert.equal(await cache.get('school-a', async () => {
    calls += 1;
    return 7;
  }), 7);
  assert.equal(calls, 2);
});

test('tenant prefix invalidation clears all user summaries only for that school', async () => {
  const cache = new SchoolReadinessCache<string>(30_000);
  const load = async (value: string) => value;
  await cache.get('school-a:teacher-1', () => load('old-a1'));
  await cache.get('school-a:teacher-2', () => load('old-a2'));
  await cache.get('school-b:teacher-1', () => load('keep-b'));

  cache.invalidatePrefix('school-a:');

  assert.equal(await cache.get('school-a:teacher-1', () => load('new-a1')), 'new-a1');
  assert.equal(await cache.get('school-a:teacher-2', () => load('new-a2')), 'new-a2');
  assert.equal(await cache.get('school-b:teacher-1', () => load('wrong-b')), 'keep-b');
});
