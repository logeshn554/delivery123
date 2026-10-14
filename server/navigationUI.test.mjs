import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('shared bottom navigation is centered, capped at phone width and safe-area aware', () => {
  const css = readFileSync(new URL('../src/design-system/tokens.css', import.meta.url), 'utf8');
  const navigation = css.match(/\.allgo-navigation\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(navigation, /max-width:\s*448px/);
  assert.match(navigation, /margin-inline:\s*auto/);
  assert.match(navigation, /var\(--allgo-safe-bottom\)/);
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
  const customerCss = readFileSync(new URL('../src/design-system/customer.css', import.meta.url), 'utf8');
  assert.equal((html.match(/disabled=""/g) || []).length, 2);
  for (const badge of ['ORDER', 'SHOP', 'SEND', 'RIDE', 'HIRE', 'CARRY']) assert.match(html, new RegExp(`>${badge}<`));
  assert.match(html, /estimated service times and final charges depend on your address/);
  assert.match(customerCss, /\.allgo-service-directory \.service-badge/);
  assert.match(customerCss, /\.allgo-service-directory \.service-icon \{[^}]*transition: transform 180ms ease/);
  assert.match(customerCss, /prefers-reduced-motion: reduce[^\n]+\.allgo-service-directory \.service-icon \{ transition: none/);
});

test('contextual cart and account pages belong to their primary navigation destinations', () => {
  for (const tab of ['home', 'services', 'orders']) assert.equal(customerDestination(tab), tab);
  assert.equal(customerDestination('cart'), 'services');
  for (const tab of ['support', 'wallet', 'settings', 'more', 'profile']) assert.equal(customerDestination(tab), 'profile');
});
