import { describe, expect, it } from 'vitest';
import { SITE } from '../../src/lib/site.ts';
import {
  bySource,
  byTag,
  collectionIdsOf,
  creditedCollections,
  creditsOf,
  listedCollections,
  neighbours,
  related,
  sourceOf,
  stats,
  tagsWithCounts,
} from '../../src/lib/site-data.ts';
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

describe('bySource', () => {
  const catalog: Wallpaper[] = [
    wallpaper('n1', ['nord'], { sourceId: 'nordic' }),
    wallpaper('d1', ['city']),
    wallpaper('g1', ['gruvbox'], { sourceId: 'gruvbox', alsoIn: ['nordic'] }),
    wallpaper('n2', ['nord'], { sourceId: 'nordic' }),
    wallpaper('d2', ['night'], { alsoIn: ['gruvbox'] }),
    wallpaper('hills', ['city'], { source: { name: 'Someone', url: 'https://example.com' } }),
  ];
  const slugs = (list: Wallpaper[]) => list.map((w) => w.slug);

  it('keeps the catalog order', () => {
    expect(slugs(bySource(catalog, 'nordic'))).toEqual(['n1', 'g1', 'n2']);
  });

  it('puts a wallpaper that is also in another collection on both pages', () => {
    expect(slugs(bySource(catalog, 'gruvbox'))).toEqual(['g1', 'd2']);
    expect(slugs(bySource(catalog, 'nordic'))).toContain('g1');
  });

  it('gives the own wallpapers to the default collection, unless their entry names another source', () => {
    expect(slugs(bySource(catalog, SITE.defaultSource.id))).toEqual(['d1', 'd2']);
    expect(bySource(catalog, 'own')).toEqual([]);
  });

  it('returns nothing for a collection without wallpapers', () => {
    expect(bySource(catalog, 'rose-pine')).toEqual([]);
  });
});

describe('collectionIdsOf', () => {
  it('lists where the wallpaper comes from, then the collections it is also in', () => {
    expect(collectionIdsOf(wallpaper('x', [], { sourceId: 'gruvbox', alsoIn: ['nordic'] }))).toEqual(['gruvbox', 'nordic']);
    expect(collectionIdsOf(wallpaper('y', [], { alsoIn: ['nordic'] }))).toEqual([SITE.defaultSource.id, 'nordic']);
  });

  it('is empty for an own wallpaper from a source that is not a collection', () => {
    expect(collectionIdsOf(wallpaper('z', [], { source: { name: 'Someone' } }))).toEqual([]);
  });
});

describe('listedCollections', () => {
  const known = [
    { id: SITE.defaultSource.id, name: 'aesthetic-wallpapers', repo: 'D3Ext/aesthetic-wallpapers' },
    { id: 'nordic', name: 'Nordic Wallpapers', repo: 'linuxdotexe/nordic-wallpapers' },
    { id: 'rose-pine', name: 'Rosé Pine Wallpapers', repo: 'rose-pine/wallpapers' },
    { id: 'gruvbox', name: 'Gruvbox Wallpapers', repo: 'AngelJumbo/gruvbox-wallpapers' },
  ];
  const catalog: Wallpaper[] = [
    wallpaper('n1', ['nord'], { sourceId: 'nordic', featured: true }),
    wallpaper('d1', ['city']),
    wallpaper('g1', ['gruvbox'], { sourceId: 'gruvbox' }),
    wallpaper('n2', ['nord'], { sourceId: 'nordic', alsoIn: ['gruvbox'] }),
    wallpaper('g2', ['gruvbox'], { sourceId: 'gruvbox', featured: true }),
    wallpaper('g3', ['gruvbox'], { sourceId: 'gruvbox' }),
  ];

  it('puts the collections with the most wallpapers first, counting those listed via alsoIn', () => {
    const listed = listedCollections(catalog, known);
    expect(listed.map((c) => [c.id, c.wallpapers.length])).toEqual([
      ['gruvbox', 4],
      ['nordic', 2],
      [SITE.defaultSource.id, 1],
    ]);
    expect(listed[0].wallpapers.map((w) => w.slug)).toEqual(['g1', 'n2', 'g2', 'g3']);
  });

  it('leaves out a collection without wallpapers', () => {
    expect(listedCollections(catalog, known).map((c) => c.id)).not.toContain('rose-pine');
  });

  it('keeps the given order between collections of the same size', () => {
    const even = [wallpaper('a', [], { sourceId: 'nordic' }), wallpaper('b', [], { sourceId: 'rose-pine' })];
    expect(listedCollections(even, known).map((c) => c.id)).toEqual(['nordic', 'rose-pine']);
  });

  it('covers a collection with its first featured wallpaper, else its first', () => {
    const covers = Object.fromEntries(listedCollections(catalog, known).map((c) => [c.id, c.cover.slug]));
    expect(covers).toEqual({ gruvbox: 'g2', nordic: 'n1', [SITE.defaultSource.id]: 'd1' });
  });

  it('keeps the name and repository it was given', () => {
    const [first] = listedCollections(catalog, known);
    expect(first).toMatchObject({ name: 'Gruvbox Wallpapers', repo: 'AngelJumbo/gruvbox-wallpapers' });
  });
});

describe('creditedCollections', () => {
  const info = (id: string) => ({ id, name: `Name ${id}`, repo: `owner/${id}` });
  const pageUrl = (id: string) => `/base/sources/${id}/`;
  const many = (n: number) => Array.from({ length: n }, (_, i) => info(`c${i + 1}`));

  it('lists the collections as owner/repo with their page, in the order given', () => {
    const { items } = creditedCollections([info('nordic'), info('gruvbox')], pageUrl);
    expect(items).toEqual([
      { id: 'nordic', name: 'owner/nordic', href: '/base/sources/nordic/' },
      { id: 'gruvbox', name: 'owner/gruvbox', href: '/base/sources/gruvbox/' },
    ]);
  });

  it('writes the count in words up to ten and in digits after', () => {
    expect(creditedCollections(many(1), pageUrl).countText).toBe('one');
    expect(creditedCollections(many(2), pageUrl).countText).toBe('two');
    expect(creditedCollections(many(4), pageUrl).countText).toBe('four');
    expect(creditedCollections(many(10), pageUrl).countText).toBe('ten');
    expect(creditedCollections(many(11), pageUrl).countText).toBe('11');
  });

  it('keeps all 11 items', () => {
    expect(creditedCollections(many(11), pageUrl).items).toHaveLength(11);
  });
});

describe('creditsOf', () => {
  const { items } = creditedCollections(
    [
      { id: SITE.defaultSource.id, name: SITE.defaultSource.title, repo: SITE.defaultSource.repo },
      { id: 'nordic-wallpapers', name: 'Nordic Wallpapers', repo: 'linuxdotexe/nordic-wallpapers' },
      { id: 'gruvbox-wallpapers', name: 'Gruvbox Wallpapers', repo: 'AngelJumbo/gruvbox-wallpapers' },
    ],
    (id) => `/sources/${id}/`,
  );

  it('names every collection as owner/repo, linked to its page, own and indexed alike', () => {
    expect(creditsOf(wallpaper('cabin', [], { alsoIn: ['gruvbox-wallpapers'] }), items)).toEqual({
      source: { name: 'D3Ext/aesthetic-wallpapers', href: '/sources/aesthetic-wallpapers/' },
      alsoIn: [{ name: 'AngelJumbo/gruvbox-wallpapers', href: '/sources/gruvbox-wallpapers/' }],
    });
    const indexed = wallpaper('lake', [], {
      sourceId: 'nordic-wallpapers',
      source: { name: 'Nordic Wallpapers', url: 'https://github.com/linuxdotexe/nordic-wallpapers' },
    });
    expect(creditsOf(indexed, items)).toEqual({
      source: { name: 'linuxdotexe/nordic-wallpapers', href: '/sources/nordic-wallpapers/' },
      alsoIn: [],
    });
  });

  it('keeps the credit of a wallpaper contributed here directly, which has no collection page', () => {
    const contributed = wallpaper('hills', [], { source: { name: 'A contributor, pull request #1', url: 'https://github.com/x/y/pull/1' } });
    expect(creditsOf(contributed, items)).toEqual({
      source: { name: 'A contributor, pull request #1', href: 'https://github.com/x/y/pull/1' },
      alsoIn: [],
    });
  });
});
