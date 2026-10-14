import test from 'node:test';
import assert from 'node:assert/strict';
import { filterCatalogSearchResults } from '../src/search/catalogSearch.ts';

const results = [
  { id: 'food:item-a', itemId: 'item-a', parentId: 'restaurant-a', service: 'food', name: 'Lemon rice', parentName: 'Kitchen A', price: 120 },
  { id: 'grocery:item-b', itemId: 'item-b', parentId: 'store-b', service: 'grocery', name: 'Rice', parentName: 'Market B', price: 80 },
];

test('global search service filters preserve all results and isolate food or grocery', () => {
  assert.deepEqual(filterCatalogSearchResults(results, 'all'), results);
  assert.deepEqual(filterCatalogSearchResults(results, 'food'), [results[0]]);
  assert.deepEqual(filterCatalogSearchResults(results, 'grocery'), [results[1]]);
});
