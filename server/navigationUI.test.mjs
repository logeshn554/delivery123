import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BottomNavigation from '../src/design-system/BottomNavigation.tsx';
import { TripBundleScreen } from '../src/components/TripBundleScreen.tsx';
import ServiceTile from '../src/design-system/ServiceTile.tsx';
import ServiceDirectory, { serviceDirectory } from '../src/features/discovery/ServiceDirectory.tsx';
import { customerDestination } from '../src/app/customerNavigation.ts';

test('shared navigation names its landmark, active destination and cart count', () => {
  const icon = () => createElement('svg');
  const html = renderToStaticMarkup(createElement(BottomNavigation, {
    items: [{ id: 'home', label: 'Home', icon }, { id: 'cart', label: 'Cart', icon, badge: 3 }],
    active: 'home', onNavigate() {},
  }));
  assert.match(html, /aria-label="Main navigation"/);
  assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
  assert.match(html, /aria-label="Cart, 3 items"/);
  assert.equal((html.match(/type="button"/g) || []).length, 2);
});

test('unverified combined booking exposes no checkout or invented catalog', () => {
  const html = renderToStaticMarkup(createElement(TripBundleScreen, { onBack() {}, onOpenTracking() {} }));
  assert.match(html, /not available yet/);
  assert.match(html, /Back to services/);
  assert.doesNotMatch(html, /Chennai|Nilgiris|Razorpay|Pay now|Get quote/);
});

test('unsupported service is disabled with a readable availability label', () => {
  const html = renderToStaticMarkup(createElement(ServiceTile, {
    label: 'Movers', description: 'Planned · not available', icon: () => createElement('svg'), unavailable: true,
  }));
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-label="Movers: Planned · not available"/);
});

test('service directory retains six service commands and disables only planned domains', () => {
  assert.deepEqual(serviceDirectory.map(service => service.id), ['food', 'grocery', 'parcel', 'ride', 'takeover', 'transport']);
  const html = renderToStaticMarkup(createElement(ServiceDirectory, { onChoose() {} }));
  assert.equal((html.match(/disabled=""/g) || []).length, 2);
  assert.match(html, /Availability and pricing are confirmed/);
});

test('contextual cart and account pages belong to their primary navigation destinations', () => {
  for (const tab of ['home', 'services', 'orders']) assert.equal(customerDestination(tab), tab);
  assert.equal(customerDestination('cart'), 'services');
  for (const tab of ['support', 'wallet', 'settings', 'more', 'profile']) assert.equal(customerDestination(tab), 'profile');
});
