export type CatalogSearchResult = {
  id: string;
  itemId: string;
  parentId: string;
  service: 'food' | 'grocery';
  name: string;
  parentName: string;
  price: number;
};

export type ServiceFilter = 'all' | 'food' | 'grocery';

export function filterCatalogSearchResults(items: CatalogSearchResult[], filter: ServiceFilter): CatalogSearchResult[] {
  return filter === 'all' ? items : items.filter(item => item.service === filter);
}
