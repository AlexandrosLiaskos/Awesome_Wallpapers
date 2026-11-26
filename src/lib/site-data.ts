import { SITE } from './site.ts';
import type { Attribution, Tag, Wallpaper } from './types.ts';

export type CountedTag = Tag & { count: number };

/** A collection as /sources/ lists it. */
export interface CollectionInfo {
  /** Its address under /sources/. */
  id: string;
  name: string;
  /** owner/name on GitHub. */
  repo: string;
}

/** A collection with its wallpapers in catalog order and the one shown on its card. */
export interface ListedCollection extends CollectionInfo {
  wallpapers: Wallpaper[];
  cover: Wallpaper;
}

export function byTag(list: Wallpaper[], tag: string): Wallpaper[] {
  return list.filter((wallpaper) => wallpaper.tags.includes(tag));
}

/**
 * The collections that hold this wallpaper, by their ids under /sources/: the
 * one it comes from, then those it is also in. An own wallpaper comes from the
 * default collection unless its entry names another source, which has no page.
 */
export function collectionIdsOf(wallpaper: Wallpaper): string[] {
  if (wallpaper.sourceId !== 'own') return [wallpaper.sourceId, ...wallpaper.alsoIn];
  return wallpaper.source ? wallpaper.alsoIn : [SITE.defaultSource.id, ...wallpaper.alsoIn];
}

export function bySource(list: Wallpaper[], id: string): Wallpaper[] {
  return list.filter((wallpaper) => collectionIdsOf(wallpaper).includes(id));
}

/** The collections that have wallpapers in the catalog, the largest first; equal ones keep their order. */
export function listedCollections(list: Wallpaper[], collections: CollectionInfo[]): ListedCollection[] {
  return collections
    .map(({ id, name, repo }) => {
      const wallpapers = bySource(list, id);
      return { id, name, repo, wallpapers, cover: wallpapers.find((w) => w.featured) ?? wallpapers[0] };
    })
    .filter((collection) => collection.wallpapers.length > 0)
    .sort((a, b) => b.wallpapers.length - a.wallpapers.length);
}

/**
 * The collections besides the default one, as the intro and the footer name
 * them after it: "one other collection", "3 other collections". Null when
 * the default collection is the only one.
 */
export function otherCollections(collections: { id: string }[]): string | null {
  const others = collections.filter((collection) => collection.id !== SITE.defaultSource.id).length;
  if (others === 0) return null;
  return others === 1 ? 'one other collection' : `${others} other collections`;
}

/** Tags in use: palettes first, then subjects, each group by how many wallpapers carry the tag. */
export function tagsWithCounts(list: Wallpaper[], tags: Tag[]): CountedTag[] {
  const counted = tags
    .map((tag) => ({ ...tag, count: byTag(list, tag.slug).length }))
    .filter((tag) => tag.count > 0)
    .sort((a, b) => b.count - a.count);
  return [...counted.filter((tag) => tag.kind === 'palette'), ...counted.filter((tag) => tag.kind !== 'palette')];
}

export function stats(list: Wallpaper[], tags: Tag[]): { total: number; fourK: number; tags: number } {
  return {
    total: list.length,
    fourK: list.filter((wallpaper) => wallpaper.size === '4k').length,
    tags: tagsWithCounts(list, tags).length,
  };
}

/** The wallpapers before and after this one; the list wraps around. */
export function neighbours(list: Wallpaper[], slug: string): { prev: Wallpaper; next: Wallpaper } {
  const index = list.findIndex((wallpaper) => wallpaper.slug === slug);
  return {
    prev: list[(index - 1 + list.length) % list.length],
    next: list[(index + 1) % list.length],
  };
}

/** Other wallpapers that share tags with this one, the most alike first. */
export function related(list: Wallpaper[], slug: string, n = 6): Wallpaper[] {
  const self = list.find((wallpaper) => wallpaper.slug === slug);
  if (!self) return [];
  return list
    .filter((other) => other.slug !== slug)
    .map((other) => ({ other, shared: other.tags.filter((tag) => self.tags.includes(tag)).length }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, n)
    .map(({ other }) => other);
}

export function sourceOf(wallpaper: Wallpaper): Attribution {
  return wallpaper.source ?? SITE.defaultSource;
}
