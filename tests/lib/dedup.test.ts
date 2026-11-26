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

/** Stands in for the picture comparison, which the media step makes from thumbnails. */
const same = async () => true;
const different = async () => false;

/** The hash with its lowest `n` bits flipped. */
function flip(hash: string, n: number): string {
  const mask = (1n << BigInt(n)) - 1n;
  return (BigInt(`0x${hash}`) ^ mask).toString(16).padStart(16, '0');
}

function flipBit(hash: string, bit: number): string {
  return (BigInt(`0x${hash}`) ^ (1n << BigInt(bit))).toString(16).padStart(16, '0');
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
  it('merges near copies into the larger image and credits the other collection', async () => {
    const small = wallpaper('small', { phash: flip(HASH, 6) });
    // First swatches 23.3 apart in RGB.
    const large = wallpaper('large', {
      width: 3840,
      height: 2160,
      sourceId: 'gruvbox',
      palette: [{ hex: '#3a4050', share: 1 }],
    });
    expect(await mergeDuplicates([small, large], same)).toEqual([{ ...large, alsoIn: ['nordic'] }]);
  });

  it('keeps images apart when the hashes differ in more than 6 bits', async () => {
    const list = [wallpaper('a'), wallpaper('b', { phash: flip(HASH, 7), sourceId: 'gruvbox' })];
    expect(await mergeDuplicates(list, same)).toEqual(list);
  });

  it('keeps a recolouring apart: same shapes, first swatch 60 apart', async () => {
    const list = [wallpaper('nord'), wallpaper('gruvbox', { sourceId: 'gruvbox', palette: [{ hex: '#6a3440', share: 1 }] })];
    expect(await mergeDuplicates(list, same)).toEqual(list);
  });

  it('keeps images apart when the first swatches are just over 24 apart', async () => {
    const list = [wallpaper('a'), wallpaper('b', { sourceId: 'gruvbox', palette: [{ hex: '#2e3459', share: 1 }] })];
    expect(await mergeDuplicates(list, same)).toHaveLength(2);
  });

  it('needs aspect ratios within 3%', async () => {
    const a = wallpaper('a');
    // 1920×1110 is 2.7% narrower than 16:9; 1920×1120 is 3.6% narrower.
    const near = wallpaper('near', { sourceId: 'gruvbox', height: 1110 });
    const far = wallpaper('far', { sourceId: 'gruvbox', height: 1120 });
    expect(await mergeDuplicates([a, near], same)).toHaveLength(1);
    expect(await mergeDuplicates([a, far], same)).toHaveLength(2);
  });

  it('keeps images apart when the pictures turn out different', async () => {
    const list = [wallpaper('tux'), wallpaper('windows', { sourceId: 'gruvbox', width: 3840, height: 2160 })];
    expect(await mergeDuplicates(list, different)).toEqual(list);
  });

  it('asks about shortlisted pairs from different collections only, the kept copy first', async () => {
    const asked: string[] = [];
    const confirm = async (a: Wallpaper, b: Wallpaper) => {
      asked.push(`${a.slug}:${b.slug}`);
      return true;
    };
    const list = [
      wallpaper('a'),
      wallpaper('b'),
      wallpaper('c', { sourceId: 'gruvbox', width: 3840, height: 2160 }),
      wallpaper('d', { sourceId: 'gruvbox', phash: 'f0f0f0f0f0f0f0f0' }),
    ];
    const merged = await mergeDuplicates(list, confirm);
    expect(asked.sort()).toEqual(['c:a', 'c:b']);
    // c takes in one nordic copy; the other nordic copy is that collection's own business.
    expect(merged.map((w) => w.slug)).toEqual(['b', 'c', 'd']);
  });

  it('takes in at most one copy per collection, so a collection keeps its own duplicates', async () => {
    // The same picture twice in one collection, say in 1080p/ and 4k/, and once elsewhere.
    const hd = wallpaper('hd');
    const qhd = wallpaper('qhd', { width: 2560, height: 1440 });
    const gruvbox = wallpaper('gruvbox', { sourceId: 'gruvbox', width: 3840, height: 2160 });
    const merged = await mergeDuplicates([hd, qhd, gruvbox], same);
    expect(merged).toEqual([hd, { ...gruvbox, alsoIn: ['nordic'] }]);
    // Without the third collection the two stay apart, and they still do with it.
    expect(await mergeDuplicates([hd, qhd], same)).toEqual([hd, qhd]);
  });

  it('lets an own wallpaper win a tie', async () => {
    const indexed = wallpaper('indexed');
    const own = wallpaper('own', { sourceId: 'own' });
    expect(await mergeDuplicates([indexed, own], same)).toEqual([{ ...own, alsoIn: ['nordic'] }]);
  });

  it('keeps the earlier of two equal indexed copies', async () => {
    const first = wallpaper('first', { sourceId: 'gruvbox' });
    const second = wallpaper('second');
    expect(await mergeDuplicates([first, second], same)).toEqual([{ ...first, alsoIn: ['nordic'] }]);
  });

  it('keeps the survivors in their input order', async () => {
    const list = [
      wallpaper('x', { phash: 'ffffffff00000000' }),
      wallpaper('copy'),
      wallpaper('y', { phash: '00000000ffffffff' }),
      wallpaper('best', { width: 2560, height: 1440, sourceId: 'gruvbox' }),
    ];
    expect((await mergeDuplicates(list, same)).map((w) => w.slug)).toEqual(['x', 'y', 'best']);
  });

  it('gathers every collection once and never the kept one', async () => {
    const list = [
      wallpaper('a', { sourceId: 'nordic', alsoIn: ['gruvbox', 'rose-pine'] }),
      wallpaper('b', { sourceId: 'gruvbox', width: 3840, height: 2160 }),
      wallpaper('c', { sourceId: 'catppuccin', phash: flip(HASH, 3), alsoIn: ['rose-pine'] }),
    ];
    const [kept, ...rest] = await mergeDuplicates(list, same);
    expect(rest).toEqual([]);
    expect(kept.slug).toBe('b');
    expect([...kept.alsoIn].sort()).toEqual(['catppuccin', 'nordic', 'rose-pine']);
  });

  it('does not change the list it is given', async () => {
    const list = [wallpaper('a', { sourceId: 'own' }), wallpaper('b', { width: 3840, height: 2160, sourceId: 'gruvbox' })];
    const before = structuredClone(list);
    await mergeDuplicates(list, same);
    expect(list).toEqual(before);
  });

  it('leaves copies within one collection alone, own wallpapers included', async () => {
    // Different logos on the same background hash alike; inside one collection they are kept.
    const own = [wallpaper('tux', { sourceId: 'own' }), wallpaper('void', { sourceId: 'own', width: 3840, height: 2160 })];
    expect(await mergeDuplicates(own, same)).toEqual(own);
    const nordic = [wallpaper('a'), wallpaper('b', { phash: flip(HASH, 2) })];
    expect(await mergeDuplicates(nordic, same)).toEqual(nordic);
  });

  it('never merges a wallpaper without a palette', async () => {
    const list = [wallpaper('a', { palette: [] }), wallpaper('b', { palette: [], sourceId: 'gruvbox' })];
    expect(await mergeDuplicates(list, same)).toEqual(list);
  });

  describe('with an own wallpaper in the group', () => {
    const own = wallpaper('tux', {
      sourceId: 'own',
      file: 'tux.png',
      title: 'Tux',
      tags: ['linux', 'minimal'],
      featured: true,
      credit: { name: 'Artist' },
      source: { name: 'D3Ext/aesthetic-wallpapers', url: 'https://github.com/D3Ext/aesthetic-wallpapers' },
      bytes: 10,
    });
    const larger = wallpaper('tux-gruvbox', {
      sourceId: 'gruvbox',
      file: 'Tux 4K.jpg',
      title: 'Tux 4K',
      tags: ['gruvbox', 'linux'],
      source: { name: 'Gruvbox Wallpapers', url: 'https://github.com/AngelJumbo/gruvbox-wallpapers' },
      width: 3840,
      height: 2160,
      bytes: 999,
      format: 'JPG',
      size: '4k',
      download: 'https://raw.githubusercontent.com/AngelJumbo/gruvbox-wallpapers/main/Tux%204K.jpg',
    });

    it('keeps the own entry and takes the download and size of the larger copy', async () => {
      const other = wallpaper('other', { phash: 'f0f0f0f0f0f0f0f0' });
      const merged = await mergeDuplicates([other, larger, own], same);
      expect(merged).toEqual([
        other,
        {
          ...own,
          file: 'Tux 4K.jpg',
          download: larger.download,
          width: 3840,
          height: 2160,
          bytes: 999,
          format: 'JPG',
          size: '4k',
          aspect: '16:9',
          shape: 'desktop',
          animated: false,
          alsoIn: ['gruvbox'],
        },
      ]);
    });

    it('keeps its own download when it is the larger copy', async () => {
      const smaller = wallpaper('tux-nordic', { width: 1280, height: 720 });
      expect(await mergeDuplicates([smaller, own], same)).toEqual([{ ...own, alsoIn: ['nordic'] }]);
    });

    it('credits every other collection and never "own"', async () => {
      const nordic = wallpaper('tux-nordic', { width: 2560, height: 1440 });
      const [kept, ...rest] = await mergeDuplicates([own, nordic, larger], same);
      expect(rest).toEqual([]);
      expect(kept).toMatchObject({ slug: 'tux', title: 'Tux', download: larger.download, width: 3840 });
      expect([...kept.alsoIn].sort()).toEqual(['gruvbox', 'nordic']);
    });

    it('takes in one own wallpaper only, so two own wallpapers never merge', async () => {
      const second = wallpaper('tux-again', { sourceId: 'own' });
      const merged = await mergeDuplicates([own, second, larger], same);
      expect(merged.map((w) => w.slug)).toEqual(['tux', 'tux-again']);
      expect(merged[0]).toMatchObject({ download: larger.download, alsoIn: ['gruvbox'] });
      expect(merged[1]).toEqual(second);
    });
  });

  it('finds every planted copy among 5,000 wallpapers in under a second', async () => {
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
    const merged = await mergeDuplicates(list, same);
    const elapsed = performance.now() - started;
    expect(merged).toHaveLength(4900);
    expect(merged.filter((w) => w.alsoIn.includes('nordic'))).toHaveLength(100);
    expect(elapsed).toBeLessThan(1000);
  });
});
