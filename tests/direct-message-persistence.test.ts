import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const storage = read('../src/server/storage.ts');
const api = read('../src/server/api.ts');
const view = read('../src/components/schooladmin/MessagesView.tsx');

test('direct messages are flushed before the API reports a successful send', () => {
  const start = storage.indexOf('public async sendMessage(');
  const end = storage.indexOf('public async markMessagesRead(', start);
  const method = storage.slice(start, end);
  assert.match(method, /this\.save\(\);\s*await this\.flush\(\);\s*return message;/);
  const routeStart = api.indexOf("apiRouter.post('/messages'");
  const routeEnd = api.indexOf("apiRouter.post('/messages/read'", routeStart);
  assert.match(api.slice(routeStart, routeEnd), /const msg = await db\.sendMessage\(/);
});

test('read receipts are persisted after marking messages as read', () => {
  const start = storage.indexOf('public async markMessagesRead(');
  const end = storage.indexOf('public async getBroadcasts(', start);
  assert.match(storage.slice(start, end), /if \(changed\) \{\s*this\.save\(\);\s*await this\.flush\(\);\s*\}/);
});

test('message UI prevents duplicate submissions and communicates pending state', () => {
  assert.match(view, /if \(!inputText\.trim\(\) \|\| !selectedContact \|\| isSending\) return/);
  assert.match(view, /setIsSending\(true\)/);
  assert.match(view, /disabled=\{!inputText\.trim\(\) \|\| isSending\}/);
  assert.match(view, /isSending \? 'Sending…' : 'Send'/);
});
