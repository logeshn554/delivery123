import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import StatusPanel from '../src/design-system/StatusPanel.tsx';
import PageHeading from '../src/design-system/PageHeading.tsx';
import { useFeedbackDialog } from '../src/components/useFeedbackDialog.tsx';

test('shared controls retain 44px touch targets, semantic focus rings and reduced-motion support', () => {
  const mobile = readFileSync(new URL('../src/design-system/mobile.css', import.meta.url), 'utf8');
  const global = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(mobile, /:where\(\.allgo-customer, \.allgo-partner\) :where\(button, input[^\n]+min-height: var\(--allgo-touch\)/);
  assert.match(global, /:focus-visible\s*\{\s*outline:\s*3px solid var\(--allgo-focus\)/);
  assert.match(mobile, /:where\(button:not\(:disabled\):active\)\s*\{\s*transform:\s*scale\(\.98\)/);
  assert.match(mobile, /prefers-reduced-motion: reduce[^\n]+transition: none/);
  assert.match(global, /\.allgo-action\s*\{[^}]*min-height:\s*52px/);
});
import { CatalogState } from '../src/design-system/CatalogState.tsx';

test('catalog loading, empty results and failures announce state consistently', () => {
  for (const kind of ['loading', 'empty', 'no-results', 'error']) {
    const html = renderToStaticMarkup(createElement(CatalogState, {
      kind, title: 'Catalog status', description: 'Current search outcome',
      action: createElement('button', { type: 'button' }, 'Retry'),
    }));
    assert.match(html, new RegExp(`role="${kind === 'error' ? 'alert' : 'status'}"`));
    assert.match(html, new RegExp(`aria-busy="${kind === 'loading'}"`));
    assert.match(html, /Current search outcome/);
    assert.match(html, /<button type="button">Retry<\/button>/);
  }
});

test('multiple feedback dialogs have distinct labels and safe non-submit actions', () => {
  function DialogHarness() { return useFeedbackDialog().dialog; }
  const html = renderToStaticMarkup(createElement('div', null,
    createElement(DialogHarness), createElement(DialogHarness)));
  const ids = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  assert.equal((html.match(/type="button"/g) || []).length, 2);
});

test('dialog motion and dimmed backdrops retain a reduced-motion escape and sheet handle', () => {
  const mobile = readFileSync(new URL('../src/design-system/mobile.css', import.meta.url), 'utf8');
  const stitch = readFileSync(new URL('../src/design-system/stitch.css', import.meta.url), 'utf8');
  const address = readFileSync(new URL('../src/components/AddressSheet.tsx', import.meta.url), 'utf8');
  assert.match(mobile, /\.allgo-feedback-dialog::backdrop[^\n]+backdrop-filter: blur/);
  assert.match(mobile, /prefers-reduced-motion: reduce[^\n]+\.allgo-feedback-dialog\[open\][^\n]+animation: none/);
  assert.match(stitch, /\.stitch-address-sheet::backdrop[^\n]+backdrop-filter: blur/);
  assert.match(address, /className="stitch-sheet-handle" aria-hidden="true"/);
});

test('loading and failed catalog states expose different assistive announcements', () => {
  const loading = renderToStaticMarkup(createElement(StatusPanel, { state: 'loading', title: 'Loading catalog' }));
  const failed = renderToStaticMarkup(createElement(StatusPanel, { state: 'error', title: 'Catalog unavailable' }, 'Try again when connected.'));
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-busy="true"/);
  assert.match(failed, /role="alert"/);
  assert.match(failed, /aria-busy="false"/);
  assert.match(failed, /Try again when connected/);
});

test('page back control is named and cannot accidentally submit an enclosing form', () => {
  const html = renderToStaticMarkup(createElement(PageHeading, { title: 'Store settings', description: 'Manage your store', onBack() {} }));
  assert.match(html, /<h1[^>]*>Store settings<\/h1>/);
  assert.match(html, /type="button"/);
  assert.match(html, /aria-label="Go back"/);
});

test('page heading variants share a 44px safe touch target and semantic title styles', () => {
  const mobile = readFileSync(new URL('../src/design-system/mobile.css', import.meta.url), 'utf8');
  const global = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  assert.match(mobile, /\.allgo-page-heading, \.mobile-page-heading, \.grocery-page-heading/);
  assert.match(mobile, /\.allgo-page-heading > button, \.mobile-page-heading > button[^\n]+width: var\(--allgo-touch\)[^\n]+min-height: var\(--allgo-touch\)/);
  assert.match(mobile, /\.allgo-page-heading h1, \.mobile-page-heading h1[^\n]+font-size: var\(--allgo-type-title\)/);
  assert.match(global, /\.safe-area-top \{ padding-top: var\(--allgo-safe-top\); \}/);
});
