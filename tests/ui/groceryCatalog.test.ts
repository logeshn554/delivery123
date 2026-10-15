import assert from 'node:assert/strict';
import test from 'node:test';
import { filterGroceryProducts, getGroceryCatalogView, hasGroceryCartConflicts } from '../../src/design-system/groceryCatalog.ts';
import type { GroceryProduct } from '../../src/types';

const product = (id: string, stock: number, category = 'Produce', price = 10): GroceryProduct => ({
  id, storeId: 'store-live', name: `Item ${id}`, stock, category, price, unit: 'pack', image: '',
});

const baseView = {
  loading: false,
  error: '',
  selectedStoreId: 'store-live',
  storeCount: 1,
  products: [] as GroceryProduct[],
  matchingProducts: [] as GroceryProduct[],
  filteredProducts: [] as GroceryProduct[],
  inStockOnly: true,
};

test('grocery catalog filters use live names, category, search, favorites and sort order', () => {
  const products = [product('pear', 3, 'Fruit', 12), product('apple', 2, 'Fruit', 8), product('bread', 4, 'Bakery', 6)];
  assert.deepEqual(filterGroceryProducts(products, { category: 'Fruit', query: ' pear ', favoriteIds: [], favoritesOnly: false, inStockOnly: true, sort: 'low' }).map(item => item.id), ['pear']);
  assert.deepEqual(filterGroceryProducts(products, { category: 'All', query: '', favoriteIds: ['product:apple'], favoritesOnly: true, inStockOnly: true, sort: 'high' }).map(item => item.id), ['apple']);
  assert.deepEqual(filterGroceryProducts(products, { category: 'All', query: '', favoriteIds: [], favoritesOnly: false, inStockOnly: true, sort: 'low' }).map(item => item.id), ['bread', 'apple', 'pear']);
  assert.deepEqual(filterGroceryProducts([product('sold-out', 0), product('available', 1)], { category: 'All', query: '', favoriteIds: [], favoritesOnly: false, inStockOnly: true, sort: 'name' }).map(item => item.id), ['available']);
});

test('grocery search includes published brand and allergen text and excludes only declared allergens', () => {
  const products = [
    { ...product('apple', 3), brand: 'Orchard House', ingredients: 'Apple', allergens: ['Walnut'] },
    { ...product('bread', 2), brand: 'Daily Bake', ingredients: 'Wheat flour', allergens: [] },
    { ...product('unknown', 1), brand: 'Local', ingredients: 'Mixed ingredients' },
  ];
  const filters = { category: 'All', favoriteIds: [], favoritesOnly: false, inStockOnly: true, sort: 'name' as const };
  assert.deepEqual(filterGroceryProducts(products, { ...filters, query: 'orchard' }).map(item => item.id), ['apple']);
  assert.deepEqual(filterGroceryProducts(products, { ...filters, query: 'walnut' }).map(item => item.id), ['apple']);
  assert.deepEqual(filterGroceryProducts(products, { ...filters, query: '', excludedAllergens: ['Walnut'] }).map(item => item.id), ['bread', 'unknown']);
});

test('grocery cart conflicts fail closed for missing, expired or insufficient-stock products', () => {
  const item = product('pear', 2, 'Fruit');
  const cart = [{ item, quantity: 2 }];
  assert.equal(hasGroceryCartConflicts(cart, [{ ...item, stock: 3 }]), false);
  assert.equal(hasGroceryCartConflicts(cart, []), true);
  assert.equal(hasGroceryCartConflicts(cart, [{ ...item, stock: 1 }]), true);
  assert.equal(hasGroceryCartConflicts(cart, [{ ...item, stock: 3, expiresAt: '2000-01-01T00:00:00.000Z' }]), true);
});

test('grocery view distinguishes errors, loading, no stores, store selection and published product emptiness', () => {
  assert.equal(getGroceryCatalogView({ ...baseView, error: 'offline', loading: true }), 'error');
  assert.equal(getGroceryCatalogView({ ...baseView, loading: true }), 'loading');
  assert.equal(getGroceryCatalogView({ ...baseView, storeCount: 0, selectedStoreId: '' }), 'no-stores');
  assert.equal(getGroceryCatalogView({ ...baseView, selectedStoreId: '' }), 'choose-store');
  assert.equal(getGroceryCatalogView(baseView), 'no-products');
});

test('grocery view distinguishes stock-empty from filter no-results', () => {
  const unavailable = [product('sold-out', 0)];
  assert.equal(getGroceryCatalogView({ ...baseView, products: unavailable, matchingProducts: unavailable }), 'no-in-stock');
  assert.equal(getGroceryCatalogView({ ...baseView, products: unavailable, matchingProducts: unavailable, filteredProducts: unavailable, inStockOnly: false }), 'products');
  assert.equal(getGroceryCatalogView({ ...baseView, products: [product('available', 4)], matchingProducts: [] }), 'no-results');
  assert.equal(getGroceryCatalogView({ ...baseView, products: unavailable, matchingProducts: [] }), 'no-results');
});
