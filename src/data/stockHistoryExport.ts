type Page<T> = { items: T[]; nextCursor: string | null };
export async function collectStockHistory<T>(read: (cursor: string | null) => Promise<Page<T>>, maximumPages = 100): Promise<T[]> {
  const items: T[] = [], seen = new Set<string>();
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < maximumPages; pageNumber++) {
    const page = await read(cursor); items.push(...page.items);
    if (!page.nextCursor) return items;
    if (seen.has(page.nextCursor)) throw new Error('Stock history pagination did not advance. No partial export was created.');
    seen.add(page.nextCursor); cursor = page.nextCursor;
  }
  throw new Error('This history needs an operator-assisted export. No partial copy was created.');
}
