import { describe, expect, it } from 'vitest';
import { EMPTY, matches, parseState, serializeState, sortSlugs, type Indexed } from '../../src/lib/filter.ts';

const known = ['nord', 'tokyo-night', 'city'];

function item(over: Partial<Indexed> = {}): Indexed {
  return {
    slug: 'lets-go-home',
    title: "Let's Go Home",
    tags: ['city', 'tokyo-night'],
    size: 'qhd',
    shape: 'desktop',
    colors: ['blue', 'pink'],
    pixels: 2560 * 1440,
    ...over,
  };
}

describe('parseState', () => {
  it('reads known filters and ignores other parameters', () => {
    expect(parseState('?tag=nord&size=4k&x=1', known)).toEqual({ ...EMPTY, tag: 'nord', size: '4k' });
  });

  it('ignores values it does not know', () => {
    expect(parseState('?size=banana&shape=round&color=beige&sort=best&tag=nope', known)).toEqual(EMPTY);
  });

  it('reads the search text', () => {
    expect(parseState('?q=tokyo+night', known).q).toBe('tokyo night');
  });

  it('treats an empty address as no filters', () => {
    expect(parseState('', known)).toEqual(EMPTY);
  });
});

describe('serializeState', () => {
  it('writes nothing when no filter is set', () => {
    expect(serializeState(EMPTY)).toBe('');
  });

  it('writes only what is set, in a fixed order', () => {
    expect(serializeState({ ...EMPTY, size: '4k', tag: 'nord' })).toBe('?tag=nord&size=4k');
  });

  it('survives a round trip', () => {
    const state = { ...EMPTY, q: 'go home & more', tag: 'city', shape: 'ultrawide', color: 'teal', sort: 'name' } as const;
    expect(parseState(serializeState(state), known)).toEqual(state);
  });
});

describe('matches', () => {
  it('matches everything when no filter is set', () => {
    expect(matches(item(), EMPTY)).toBe(true);
  });

  it('filters by tag', () => {
    expect(matches(item(), { ...EMPTY, tag: 'city' })).toBe(true);
    expect(matches(item(), { ...EMPTY, tag: 'nord' })).toBe(false);
  });

  it('treats a size as a minimum', () => {
    expect(matches(item({ size: '4k' }), { ...EMPTY, size: 'qhd' })).toBe(true);
    expect(matches(item({ size: 'qhd' }), { ...EMPTY, size: 'qhd' })).toBe(true);
    expect(matches(item({ size: 'fhd' }), { ...EMPTY, size: 'qhd' })).toBe(false);
    expect(matches(item({ size: 'hd' }), { ...EMPTY, size: 'fhd' })).toBe(false);
  });

  it('filters by shape and by colour', () => {
    expect(matches(item(), { ...EMPTY, shape: 'phone' })).toBe(false);
    expect(matches(item(), { ...EMPTY, color: 'pink' })).toBe(true);
    expect(matches(item(), { ...EMPTY, color: 'green' })).toBe(false);
  });

  it('requires every filter at once', () => {
    expect(matches(item(), { ...EMPTY, tag: 'city', color: 'pink', size: 'fhd' })).toBe(true);
    expect(matches(item(), { ...EMPTY, tag: 'city', color: 'green' })).toBe(false);
  });

  it('searches titles ignoring case and punctuation', () => {
    expect(matches(item(), { ...EMPTY, q: 'LETS GO' })).toBe(true);
  });

  it('searches tags, so "tokyo night" finds the tag tokyo-night', () => {
    expect(matches(item({ title: 'Untitled' }), { ...EMPTY, q: 'tokyo night' })).toBe(true);
  });

  it('needs every word of the search to be found somewhere', () => {
    expect(matches(item(), { ...EMPTY, q: 'home city' })).toBe(true);
    expect(matches(item(), { ...EMPTY, q: 'home forest' })).toBe(false);
  });

  it('finds wallpapers by size and shape words', () => {
    expect(matches(item({ size: '4k', shape: 'ultrawide' }), { ...EMPTY, q: '4k ultrawide' })).toBe(true);
  });

  it('matches nothing, without failing, when the filters contradict each other', () => {
    const impossible = { ...EMPTY, tag: 'nord', shape: 'phone', color: 'green', q: 'zzz' } as const;
    expect([item(), item({ tags: [] }), item({ colors: [] })].some((w) => matches(w, impossible))).toBe(false);
  });
});

describe('sortSlugs', () => {
  const list = [
    item({ slug: 'b', title: 'Beta', pixels: 100 }),
    item({ slug: 'c', title: 'alpha', pixels: 300 }),
    item({ slug: 'a', title: 'Gamma', pixels: 200 }),
  ];

  it('keeps the given order for featured', () => {
    expect(sortSlugs(list, 'featured')).toEqual(['b', 'c', 'a']);
  });

  it('puts the most pixels first for resolution', () => {
    expect(sortSlugs(list, 'resolution')).toEqual(['c', 'a', 'b']);
  });

  it('orders titles alphabetically, ignoring case, for name', () => {
    expect(sortSlugs(list, 'name')).toEqual(['c', 'b', 'a']);
  });
});
