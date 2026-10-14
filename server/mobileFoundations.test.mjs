import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import StatusPanel from '../src/design-system/StatusPanel.tsx';
import PageHeading from '../src/design-system/PageHeading.tsx';
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
