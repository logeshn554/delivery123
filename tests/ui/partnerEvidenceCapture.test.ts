import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/components/PartnerEvidencePanel.tsx', import.meta.url), 'utf8');

test('partner evidence accepts camera-captured photos and existing files on mobile', () => {
  assert.match(source, /type="file"[^>]*accept="image\/png,image\/jpeg,application\/pdf"[^>]*capture="environment"/);
  assert.match(source, /On mobile, use the camera or choose an existing file/);
});
