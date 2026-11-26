import { describe, expect, it } from 'vitest';
import { hamming, mergeDuplicates } from '../../src/lib/dedup.ts';
import type { Wallpaper } from '../../src/lib/types.ts';

const HASH = '0f0f0f0f0f0f0f0f';

function wallpaper(slug: string, over: Partial<Wallpaper> = {}): Wallpaper {
  return {
    file: `${slug}.png`,
    title: slug,
    tags: ['nord', 'minimal'],
    slug,
    width: 1920,
    height: 1080,
    bytes: 1,
    format: 'PNG',
    aspect: '16:9',
    size: 'fhd',
    shape: 'desktop',
    palette: [{ hex: '#2e3440', share: 1 }],
    colors: ['dark'],
    animated: false,
    download: `https://example.com/${slug}.png`,
    sourceId: 'nordic',
    alsoIn: [],
    phash: HASH,
    ...over,
  };
}

/** The hash with its lowest `n` bits flipped. */
function flip(hash: string, n: number): string {
  const mask = (1n << BigInt(n)) - 1n;
  return (BigInt(`0x${hash}`) ^ mask).toString(16).padStart(16, '0');
}

describe('hamming', () => {
  it('counts the bits two hashes differ in', () => {
    expect(hamming(HASH, HASH)).toBe(0);
    expect(hamming('0000000000000000', 'ffffffffffffffff')).toBe(64);
    expect(hamming('8000000000000001', '0000000000000000')).toBe(2);
    expect(hamming(HASH, flip(HASH, 6))).toBe(6);
  });
});

describe('mergeDuplicates', () => {
  it('merges near copies into the larger image and credits the other collection', () => {
    const small = wallpaper('small', { phash: flip(HASH, 6) });
    // First swatches 23.3 apart in RGB.
    const large = wallpaper('large', {
      width: 3840,
      height: 2160,
      sourceId: 'gruvbox',
      palette: [{ hex: '#3a4050', share: 1 }],
    });
    expect(mergeDuplicates([small, large])).toEqual([{ ...large, alsoIn: ['nordic'] }]);
  });

  it('keeps images apart when the hashes differ in more than 6 bits', () => {
    const list = [wallpaper('a'), wallpaper('b', { phash: flip(HASH, 7), sourceId: 'gruvbox' })];
    expect(mergeDuplicates(list)).toEqual(list);
  });

  it('keeps a recolouring apart: same shapes, first swatch 60 apart', () => {
    const list = [wallpaper('nord'), wallpaper('gruvbox', { sourceId: 'gruvbox', palette: [{ hex: '#6a3440', share: 1 }] })];
    expect(mergeDuplicates(list)).toEqual(list);
  });

  it('keeps images apart when the first swatches are just over 24 apart', () => {
    const list = [wallpaper('a'), wallpaper('b', { sourceId: 'gruvbox', palette: [{ hex: '#2e3459', share: 1 }] })];
    expect(mergeDuplicates(list)).toHaveLength(2);
  });

  it('lets an own wallpaper win a tie', () => {
    const indexed = wallpaper('indexed');
    const own = wallpaper('own', { sourceId: 'own' });
    expect(mergeDuplicates([indexed, own])).toEqual([{ ...own, alsoIn: ['nordic'] }]);
  });

  it('keeps the earlier of two equal indexed copies', () => {
    const first = wallpaper('first', { sourceId: 'gruvbox' });
    const second = wallpaper('second');
    expect(mergeDuplicates([first, second])).toEqual([{ ...first, alsoIn: ['nordic'] }]);
  });

  it('keeps the survivors in their input order', () => {
    const list = [
      wallpaper('x', { phash: 'ffffffff00000000' }),
      wallpaper('copy'),
      wallpaper('y', { phash: '00000000ffffffff' }),
      wallpaper('best', { width: 2560, height: 1440, sourceId: 'gruvbox' }),
    ];
    expect(mergeDuplicates(list).map((w) => w.slug)).toEqual(['x', 'y', 'best']);
  });

  it('gathers every collection once and never the kept one', () => {
    const list = [
      wallpaper('a', { sourceId: 'nordic', alsoIn: ['gruvbox', 'rose-pine'] }),
      wallpaper('b', { sourceId: 'gruvbox', width: 3840, height: 2160 }),
      wallpaper('c', { sourceId: 'nordic', phash: flip(HASH, 3) }),
    ];
    const [kept, ...rest] = mergeDuplicates(list);
    expect(rest).toEqual([]);
    expect(kept.slug).toBe('b');
    expect([...kept.alsoIn].sort()).toEqual(['nordic', 'rose-pine']);
  });

  it('does not change the list it is given', () => {
    const list = [wallpaper('a'), wallpaper('b', { width: 3840, height: 2160, sourceId: 'gruvbox' })];
    const before = structuredClone(list);
    mergeDuplicates(list);
    expect(list).toEqual(before);
  });

  it('leaves copies within one collection alone, own wallpapers included', () => {
    // Different logos on the same background hash alike; inside one collection they are kept.
    const own = [wallpaper('tux', { sourceId: 'own' }), wallpaper('void', { sourceId: 'own', width: 3840, height: 2160 })];
    expect(mergeDuplicates(own)).toEqual(own);
    const nordic = [wallpaper('a'), wallpaper('b', { phash: flip(HASH, 2) })];
    expect(mergeDuplicates(nordic)).toEqual(nordic);
  });

  it('never merges a wallpaper without a palette', () => {
    const list = [wallpaper('a', { palette: [] }), wallpaper('b', { palette: [], sourceId: 'gruvbox' })];
    expect(mergeDuplicates(list)).toEqual(list);
  });

  it('finds every planted copy among 5,000 wallpapers in under a second', () => {
    // A fixed pseudo-random sequence (mulberry32), so the test is the same every run.
    let seed = 42;
    const next = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    };
    const hex = (bits: number) => (next() >>> (32 - bits)).toString(16).padStart(bits / 4, '0');
    const list: Wallpaper[] = [];
    for (let i = 0; i < 4900; i++) {
      list.push(wallpaper(`w${i}`, { phash: hex(16) + hex(16) + hex(16) + hex(16), palette: [{ hex: `#${hex(24)}`, share: 1 }] }));
    }
    for (let i = 0; i < 100; i++) {
      const original = list[i * 49];
      // Up to 6 bits flipped anywhere in the hash, including the first byte.
      let phash = original.phash;
      for (let b = 0; b < 6; b++) phash = flipBit(phash, (i * 7 + b * 11) % 64);
      list.push({ ...original, slug: `copy${i}`, sourceId: 'gruvbox', width: 3840, height: 2160, phash });
    }
    const started = performance.now();
    const merged = mergeDuplicates(list);
    const elapsed = performance.now() - started;
    expect(merged).toHaveLength(4900);
    expect(merged.filter((w) => w.alsoIn.includes('nordic'))).toHaveLength(100);
    expect(elapsed).toBeLessThan(1000);
  });
});

function flipBit(hash: string, bit: number): string {
  return (BigInt(`0x${hash}`) ^ (1n << BigInt(bit))).toString(16).padStart(16, '0');
}
