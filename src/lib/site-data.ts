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

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** A collection as the intro and the footer name it: owner/repo, linked to its page. */
export interface CreditedCollection {
  id: string;
  name: string;
  href: string;
}

/**
 * The collections the intro and the footer name, all equally and in the order
 * /sources/ lists them, with how many there are: in words up to ten, in digits
 * after. The page address comes from the caller because it depends on the base path.
 */
export function creditedCollections(
  collections: CollectionInfo[],
  pageUrl: (id: string) => string,
): { items: CreditedCollection[]; countText: string } {
  const items = collections.map(({ id, repo }) => ({ id, name: repo, href: pageUrl(id) }));
  const count = items.length;
  return { items, countText: count < NUMBER_WORDS.length ? NUMBER_WORDS[count] : String(count) };
}

/** A credit on a wallpaper page: a name, linked when there is somewhere to go. */
export interface CreditLink {
  name: string;
  href?: string;
}

/**
 * How a wallpaper page credits its collections, in the form of the intro and the footer: owner/repo,
 * linked to the collection's page. `source` is the one it comes from, `alsoIn` the others that have
 * it. An own wallpaper whose entry credits someone else (a contribution, which has no collection
 * page) keeps that credit as its source.
 */
export function creditsOf(wallpaper: Wallpaper, credited: CreditedCollection[]): { source: CreditLink; alsoIn: CreditLink[] } {
  const byId = new Map(credited.map(({ id, name, href }) => [id, { name, href }]));
  const ids = collectionIdsOf(wallpaper);
  const links = ids.flatMap((id) => byId.get(id) ?? []);
  if (wallpaper.sourceId === 'own' && wallpaper.source) {
    return { source: { name: wallpaper.source.name, href: wallpaper.source.url || undefined }, alsoIn: links };
  }
  const fallback = sourceOf(wallpaper);
  const source = byId.get(ids[0]) ?? { name: fallback.name, href: fallback.url || undefined };
  return { source, alsoIn: ids.slice(1).flatMap((id) => byId.get(id) ?? []) };
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
