import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EmptyState, ErrorState, LoadingState } from '../src/components/common/AsyncState.tsx';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('all loading, empty and retryable error states share one component module', () => {
  assert.equal(typeof LoadingState, 'function');
  assert.equal(typeof EmptyState, 'function');
  assert.equal(typeof ErrorState, 'function');
  assert.match(read('../src/components/common/ErrorState.tsx'), /export \{ ErrorState \} from '\.\/AsyncState\.tsx'/);
});

test('shared loading and error states announce status and provide a Somali retry action', () => {
  const source = read('../src/components/common/AsyncState.tsx');
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-live="assertive"/);
  assert.match(source, /Isku day mar kale/);
  assert.match(source, /focus-visible:outline/);
});
