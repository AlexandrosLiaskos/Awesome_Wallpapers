import { SITE } from './site.ts';
import type { Attribution, Tag, Wallpaper } from './types.ts';

export type CountedTag = Tag & { count: number };

export function byTag(list: Wallpaper[], tag: string): Wallpaper[] {
  return list.filter((wallpaper) => wallpaper.tags.includes(tag));
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
