// A listing renders its first PAGE_SIZE cards into the HTML. Without scripts the
// rest are on later pages; with scripts the browser adds them PAGE_SIZE at a time.

/** Cards per listing page, and per batch the browser adds while scrolling. */
export const PAGE_SIZE = 120;

/** The next `size` slugs of `order` that are not rendered yet, in order. */
export function nextBatch(order: string[], rendered: ReadonlySet<string>, size: number = PAGE_SIZE): string[] {
  const batch: string[] = [];
  for (const slug of order) {
    if (batch.length >= size) break;
    if (!rendered.has(slug)) batch.push(slug);
  }
  return batch;
}

/** How many pages a listing of `total` items has; an empty listing still has its first page. */
export function pageCount(total: number, size: number = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Which wallpapers a listing shows: the whole catalog or one tag. */
export type WallScope = { kind: 'all' } | { kind: 'tag'; tag: string };

/** The scope as the wall's data-scope attribute. */
export function scopeKey(scope: WallScope): string {
  return scope.kind === 'tag' ? `tag:${scope.tag}` : 'all';
}

/** Reads a data-scope attribute; null for anything this version does not know. */
export function parseScope(key: string): WallScope | null {
  if (key === 'all') return { kind: 'all' };
  const tag = /^tag:(.+)$/.exec(key)?.[1];
  return tag ? { kind: 'tag', tag } : null;
}

/** The address of the scope's first page, without the base path. */
export function scopePath(scope: WallScope): string {
  return scope.kind === 'tag' ? `/tags/${scope.tag}/` : '/';
}

export function inScope(wallpaper: { tags: string[] }, scope: WallScope): boolean {
  return scope.kind === 'all' || wallpaper.tags.includes(scope.tag);
}
