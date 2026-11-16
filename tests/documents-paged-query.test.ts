import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPagedItems } from '../src/lib/documents/paged-query.ts';

test('collects all 40 students when the class fits within one database page', async () => {
  const rows = Array.from({ length:40 }, (_, index) => ({ id:index + 1 }));
  const pages:number[] = [];
  const result = await collectPagedItems(async (page, pageSize) => {
    pages.push(page);
    return { items:rows.slice((page - 1) * pageSize, page * pageSize), total:rows.length };
  });
  assert.equal(result.length,40);
  assert.deepEqual(pages,[1]);
});

test('collects every student across multiple pages instead of truncating at 100', async () => {
  const rows = Array.from({ length:245 }, (_, index) => ({ id:index + 1 }));
  const pages:number[] = [];
  const result = await collectPagedItems(async (page, pageSize) => {
    pages.push(page);
    return { items:rows.slice((page - 1) * pageSize, page * pageSize), total:rows.length };
  });
  assert.equal(result.length,245);
  assert.deepEqual(pages,[1,2,3]);
  assert.equal(result[244].id,245);
});

test('rejects a class larger than the configured safety limit', async () => {
  await assert.rejects(
    () => collectPagedItems(async () => ({ items:[{ id:1 }], total:5001 }), { maxItems:5000 }),
    RangeError
  );
});

test('fails rather than returning a silently incomplete roster', async () => {
  await assert.rejects(
    () => collectPagedItems(async page => ({ items:page === 1 ? [{ id:1 }] : [], total:2 })),
    /ended before all records/
  );
});
