const test = require('node:test');
const assert = require('node:assert/strict');
const { checkoutCatalogItem } = require('./checkoutCatalog');
const dish = { price: 12.34, available: true };
const option = { id: 'large', label: 'Large', price: 20.01, available: true };
test('catalog resolves base and selected prices as exact integer paise', () => {
  assert.deepEqual(checkoutCatalogItem(dish, undefined, 'food', 1), { price: 12.34, unitCents: 1234 });
  assert.deepEqual(checkoutCatalogItem({ ...dish, variants: [option] }, 'large', 'food', 2), { price: 20.01, unitCents: 2001, variantName: 'Large' });
});
test('checkout revalidation rejects options introduced or removed after quoting', () => {
  assert.throws(() => checkoutCatalogItem({ ...dish, variants: [option] }, undefined, 'food', 1), /requires an option/);
  assert.throws(() => checkoutCatalogItem(dish, 'large', 'food', 1), /no longer available/);
  assert.throws(() => checkoutCatalogItem({ ...dish, variants: [{ ...option, available: false }] }, 'large', 'food', 1));
  assert.throws(() => checkoutCatalogItem({ ...dish, available: false }, undefined, 'food', 1));
  assert.throws(() => checkoutCatalogItem(undefined, undefined, 'food', 1));
});
test('malformed and ambiguous catalog records fail closed before money or stock changes', () => {
  for (const price of [0, -1, NaN, Infinity, '12.34', 1.001, 100000.01]) assert.throws(() => checkoutCatalogItem({ ...dish, price }, undefined, 'food', 1));
  for (const variants of [{}, [option, option], [{ ...option, label: '' }]]) assert.throws(() => checkoutCatalogItem({ ...dish, variants }, 'large', 'food', 1));
  for (const quantity of [0, 31, 1.5, NaN]) assert.throws(() => checkoutCatalogItem(dish, undefined, 'food', quantity));
});
test('grocery revalidation rejects expired products, fractions and depleted inventory', () => {
  const product = { price: 0.29, stock: 2, expiresAt: '2026-10-23T12:00:00.000Z' };
  const now = Date.parse(product.expiresAt);
  assert.equal(checkoutCatalogItem(product, undefined, 'grocery', 2, now - 1).unitCents, 29);
  assert.throws(() => checkoutCatalogItem(product, undefined, 'grocery', 1, now));
  assert.throws(() => checkoutCatalogItem({ ...product, stock: 1.5 }, undefined, 'grocery', 1, now - 1));
  assert.throws(() => checkoutCatalogItem(product, undefined, 'grocery', 3, now - 1));
  assert.throws(() => checkoutCatalogItem(product, 'large', 'grocery', 1, now - 1));
});

test('food checkout resolves required add-on groups and authoritative paise pricing', () => {
  const groups = [{ id: 'toppings', label: 'Extra toppings', required: true, maxSelections: 2, options: [{ id: 'cheese', label: 'Cheese', price: 10.25, available: true }, { id: 'onion', label: 'Onion', price: 0, available: true }] }];
  assert.deepEqual(checkoutCatalogItem({ ...dish, addOnGroups: groups }, undefined, 'food', 2, Date.now(), ['cheese', 'onion']), { price: 22.59, unitCents: 2259, addOns: [{ id: 'cheese', name: 'Cheese', price: 10.25 }, { id: 'onion', name: 'Onion', price: 0 }] });
  assert.throws(() => checkoutCatalogItem({ ...dish, addOnGroups: groups }, undefined, 'food', 1), /required dish add-ons/i);
  assert.throws(() => checkoutCatalogItem({ ...dish, addOnGroups: groups }, undefined, 'food', 1, Date.now(), ['cheese', 'onion', 'unknown']));
  assert.throws(() => checkoutCatalogItem({ ...dish, addOnGroups: groups.map(group => ({ ...group, options: group.options.map(option => ({ ...option, available: false })) })) }, undefined, 'food', 1, Date.now(), ['cheese']));
  assert.throws(() => checkoutCatalogItem({ price: 10, stock: 2, expiresAt: '2026-12-01T00:00:00.000Z' }, undefined, 'grocery', 1, Date.now(), ['cheese']), /do not support menu options/);
});
