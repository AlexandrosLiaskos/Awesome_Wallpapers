import { describe, expect, it } from 'vitest';
import { SITE } from '../../src/lib/site.ts';
import { byTag, neighbours, related, sourceOf, stats, tagsWithCounts } from '../../src/lib/site-data.ts';
import type { Tag, Wallpaper } from '../../src/lib/types.ts';

function wallpaper(slug: string, tags: string[], over: Partial<Wallpaper> = {}): Wallpaper {
  return {
    file: `${slug}.png`,
    title: slug,
    tags,
    slug,
    width: 1920,
    height: 1080,
    bytes: 1,
    format: 'PNG',
    aspect: '16:9',
    size: 'fhd',
    shape: 'desktop',
    palette: [],
    colors: [],
    animated: false,
    download: `https://example.com/${slug}.png`,
    sourceId: 'own',
    alsoIn: [],
    phash: '0000000000000000',
    ...over,
  };
}

const tags: Tag[] = [
  { slug: 'city', label: 'City', kind: 'subject', description: '' },
  { slug: 'night', label: 'Night', kind: 'subject', description: '' },
  { slug: 'nord', label: 'Nord', kind: 'palette', description: '', swatch: '#88c0d0' },
  { slug: 'gruvbox', label: 'Gruvbox', kind: 'palette', description: '' },
  { slug: 'unused', label: 'Unused', kind: 'subject', description: '' },
];

const list: Wallpaper[] = [
  wallpaper('a', ['city', 'night', 'nord'], { size: '4k' }),
  wallpaper('b', ['city', 'night']),
  wallpaper('c', ['city', 'gruvbox']),
  wallpaper('d', ['night', 'gruvbox'], { size: '4k' }),
  wallpaper('e', ['city', 'gruvbox']),
];

describe('byTag', () => {
  it('keeps the wallpapers that carry the tag, in order', () => {
    expect(byTag(list, 'night').map((w) => w.slug)).toEqual(['a', 'b', 'd']);
  });

  it('returns nothing for a tag nobody uses', () => {
    expect(byTag(list, 'unused')).toEqual([]);
  });
});

describe('tagsWithCounts', () => {
  it('puts palettes first, then the most used tags, and drops unused ones', () => {
    expect(tagsWithCounts(list, tags).map((t) => [t.slug, t.count])).toEqual([
      ['gruvbox', 3],
      ['nord', 1],
      ['city', 4],
      ['night', 3],
    ]);
  });
});

describe('stats', () => {
  it('counts wallpapers, 4K wallpapers and tags in use', () => {
    expect(stats(list, tags)).toEqual({ total: 5, fourK: 2, tags: 4 });
  });
});

describe('neighbours', () => {
  it('returns the wallpapers before and after', () => {
    const { prev, next } = neighbours(list, 'c');
    expect([prev.slug, next.slug]).toEqual(['b', 'd']);
  });

  it('wraps around at both ends', () => {
    expect(neighbours(list, 'a').prev.slug).toBe('e');
    expect(neighbours(list, 'e').next.slug).toBe('a');
  });
});

describe('related', () => {
  it('ranks by shared tags and never includes the wallpaper itself', () => {
    expect(related(list, 'a').map((w) => w.slug)).toEqual(['b', 'c', 'd', 'e']);
  });

  it('respects the limit', () => {
    expect(related(list, 'a', 2).map((w) => w.slug)).toEqual(['b', 'c']);
  });

  it('leaves out wallpapers that share nothing', () => {
    const lonely = [...list, wallpaper('z', ['unused'])];
    expect(related(lonely, 'z')).toEqual([]);
  });
});

describe('sourceOf', () => {
  it('falls back to the default collection', () => {
    expect(sourceOf(list[0])).toEqual(SITE.defaultSource);
  });

  it('prefers the source written on the entry', () => {
    const own = { name: 'Someone', url: 'https://example.com' };
    expect(sourceOf(wallpaper('x', [], { source: own }))).toEqual(own);
  });
});
