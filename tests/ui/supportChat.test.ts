import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('journey chat renders sender role, message bubbles and recorded timestamps', () => {
  const chat = readFileSync(new URL('../../src/features/tracking/BundleLegChat.tsx', import.meta.url), 'utf8');
  const backend = readFileSync(new URL('../../functions/bundleChat.js', import.meta.url), 'utf8');
  assert.match(backend, /senderRole: account\.data\(\)\.role/);
  assert.match(chat, /message\.senderRole === 'driver' \? 'Delivery partner'/);
  assert.match(chat, /message\.senderRole === 'merchant' \? 'Store partner'/);
  assert.match(chat, /<time className=/);
  assert.match(chat, /bg-indigo-700 text-white/);
});

test('support history identifies customer and staff replies and explains text-only cases', () => {
  const support = readFileSync(new URL('../../src/components/SupportCasePanel.tsx', import.meta.url), 'utf8');
  assert.match(support, /AllGo support · Staff/);
  assert.match(support, /You · Customer/);
  assert.match(support, /Case replies are text-only/);
  assert.match(support, /Attachments are not supported/);
  assert.match(support, /Time unavailable/);
});
