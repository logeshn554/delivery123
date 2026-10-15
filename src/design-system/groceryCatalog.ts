import type { GroceryProduct } from '../types';

export type GroceryCatalogView = 'loading' | 'error' | 'no-stores' | 'choose-store' | 'no-products' | 'no-in-stock' | 'no-results' | 'products';

export interface GroceryProductFilters {
  category: string;
  query: string;
  favoriteIds: string[];
  favoritesOnly: boolean;
  inStockOnly: boolean;
  sort: 'name' | 'low' | 'high';
  excludedAllergens?: string[];
}

export function filterGroceryProducts(products: GroceryProduct[], filters: GroceryProductFilters): GroceryProduct[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return products
    .filter((product) => (filters.category === 'All' || product.category === filters.category)
      && (!query || `${product.name} ${product.brand || ''} ${product.category} ${product.unit} ${(product.ingredients || '')} ${(product.allergens || []).join(' ')}`.toLocaleLowerCase().includes(query))
      && (!filters.favoritesOnly || filters.favoriteIds.includes(`product:${product.id}`))
      && !(filters.excludedAllergens || []).some(allergen => product.allergens?.includes(allergen))
      && (!filters.inStockOnly || product.stock > 0))
    .sort((a, b) => filters.sort === 'low' ? a.price - b.price : filters.sort === 'high' ? b.price - a.price : a.name.localeCompare(b.name));
}

export function getGroceryCatalogView(input: {
  loading: boolean;
  error: string;
  selectedStoreId: string;
  storeCount: number;
  products: GroceryProduct[];
  matchingProducts: GroceryProduct[];
  filteredProducts: GroceryProduct[];
  inStockOnly: boolean;
}): GroceryCatalogView {
  if (input.error) return 'error';
  if (input.loading) return 'loading';
  if (!input.storeCount) return 'no-stores';
  if (!input.selectedStoreId) return 'choose-store';
  if (!input.products.length) return 'no-products';
  if (!input.filteredProducts.length && input.inStockOnly && input.matchingProducts.length > 0) return 'no-in-stock';
  if (!input.filteredProducts.length) return 'no-results';
  return 'products';
}
