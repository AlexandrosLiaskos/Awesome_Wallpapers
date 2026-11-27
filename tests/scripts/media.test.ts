import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildHomeOg,
  buildMedia,
  catalogOrder,
  measureOriginal,
  ownItem,
  ownWallpaper,
  PIPELINE_VERSION,
  thumbnailsMatch,
  type Derived,
  type MediaItem,
  type MediaOptions,
} from '../../scripts/lib/media.ts';
import { dHash } from '../../scripts/lib/phash.ts';
import { hamming, mergeDuplicates } from '../../src/lib/dedup.ts';
import { toWallpaper } from '../../src/lib/indexed.ts';
import { rawUrl } from '../../src/lib/slug.ts';
import type { Source } from '../../src/lib/sources.ts';
import type { ApprovedFile, Entry, Wallpaper } from '../../src/lib/types.ts';

let root: string;
let imagesDir: string;
let opts: MediaOptions;

const entries: Entry[] = [
  { file: 'Solid Blue.png', title: 'Solid Blue', tags: ['a', 'b'] },
  { file: 'tall.jpg', title: 'Tall', tags: ['a', 'b'], featured: true },
  { file: 'loop.gif', title: 'Loop', tags: ['a', 'b'] },
  { file: 'clear.png', title: 'Clear', tags: ['a', 'b'], featured: true },
];

const HEX16 = /^[0-9a-f]{16}$/;

function blank(width: number, height: number, background: string | object) {
  return sharp({ create: { width, height, channels: 4, background } });
}

async function writeSolid(colour: string) {
  await blank(1920, 1080, colour).png().toFile(join(imagesDir, 'Solid Blue.png'));
}

// Textured, so its fingerprint is not the all-zero hash of a flat image.
const TALL_SVG = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="2340">
    <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#cc3344"/><stop offset="1" stop-color="#d04050"/>
    </linearGradient></defs>
    <rect width="1080" height="2340" fill="url(#g)"/>
    <circle cx="300" cy="700" r="200" fill="#a02030"/>
  </svg>`);

// Read through a buffer: on Windows libvips keeps a file it opened by path locked.
async function metadataOf(outDir: string, path: string) {
  return sharp(await readFile(join(outDir, path))).metadata();
}

function hexDistance(a: string, b: string): number {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Own items as the build makes them, with the SHA-1 of each file. */
async function ownItems(list = entries): Promise<MediaItem[]> {
  return Promise.all(
    list.map(async (entry) => {
      const bytes = await readFile(join(imagesDir, entry.file));
      return ownItem(entry, imagesDir, createHash('sha1').update(bytes).digest('hex'));
    }),
  );
}

/** An item whose reads are counted; `bytes` stands in for the download. */
function counted(item: Omit<MediaItem, 'read'>, bytes: () => Promise<Buffer>) {
  const calls = { reads: 0 };
  const read = async () => {
    calls.reads += 1;
    return bytes();
  };
  return { calls, item: { ...item, read } };
}

function unreadable(item: MediaItem): MediaItem {
  return {
    ...item,
    read: () => {
      throw new Error(`${item.key} was read`);
    },
  };
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'aw-media-'));
  imagesDir = join(root, 'images');
  opts = { outDir: join(root, 'out'), cacheFile: join(root, 'cache', 'media.json') };
  await mkdir(imagesDir, { recursive: true });
  await writeSolid('#336699');
  await sharp(TALL_SVG).jpeg().toFile(join(imagesDir, 'tall.jpg'));
  const frames = await Promise.all(['#112233', '#445566'].map((c) => blank(1920, 1080, c).png().toBuffer()));
  await sharp(frames, { join: { animated: true } }).gif().toFile(join(imagesDir, 'loop.gif'));
  await blank(1920, 1080, { r: 0, g: 0, b: 0, alpha: 0 }).png().toFile(join(imagesDir, 'clear.png'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('ownItem', () => {
  it('names a file of images/ by its file name and reads it from there', async () => {
    const item = ownItem({ file: 'tall.jpg', title: 'Tall', tags: [], slug: 'custom' }, imagesDir, 'abc');
    expect(item).toMatchObject({ key: 'own:tall.jpg', slug: 'custom', sha: 'abc' });
    expect((await item.read()).equals(await readFile(join(imagesDir, 'tall.jpg')))).toBe(true);
  });
});

describe('buildMedia', () => {
  let first: Awaited<ReturnType<typeof buildMedia>>;
  let wallpapers: Wallpaper[];
  const find = (slug: string) => wallpapers.find((w) => w.slug === slug) as Wallpaper;

  beforeAll(async () => {
    first = await buildMedia(await ownItems(), opts);
    wallpapers = entries.map((entry) => ownWallpaper(entry, first.derived.get(`own:${entry.file}`)!));
  });

  it('processes every item on the first run', () => {
    expect(first).toMatchObject({ processed: 4, cached: 0, failed: [] });
    expect([...first.derived.keys()].sort()).toEqual(entries.map((e) => `own:${e.file}`).sort());
  });

  it('writes a thumbnail, a 2x thumbnail, a preview and a share image per wallpaper', () => {
    for (const slug of ['solid-blue', 'tall', 'loop', 'clear']) {
      for (const path of [`t/${slug}.webp`, `t/${slug}@2x.webp`, `p/${slug}.webp`, `og/${slug}.jpg`]) {
        expect(existsSync(join(opts.outDir, path)), path).toBe(true);
      }
    }
  });

  it('makes thumbnails 300 px high, and 600 px at 2x', async () => {
    expect((await metadataOf(opts.outDir, 't/solid-blue.webp')).height).toBe(300);
    expect((await metadataOf(opts.outDir, 't/solid-blue@2x.webp')).height).toBe(600);
  });

  it('keeps previews within 1280 px on both sides without enlarging', async () => {
    const wide = await metadataOf(opts.outDir, 'p/solid-blue.webp');
    const tall = await metadataOf(opts.outDir, 'p/tall.webp');
    expect([wide.width, wide.height]).toEqual([1280, 720]);
    expect(tall.height).toBe(1280);
  });

  it('makes share images 1200 by 630', async () => {
    const og = await metadataOf(opts.outDir, 'og/tall.jpg');
    expect([og.width, og.height]).toEqual([1200, 630]);
  });

  it('records what it measured', () => {
    expect(find('solid-blue')).toMatchObject({
      file: 'Solid Blue.png',
      title: 'Solid Blue',
      width: 1920,
      height: 1080,
      format: 'PNG',
      aspect: '16:9',
      size: 'fhd',
      shape: 'desktop',
      animated: false,
    });
    expect(find('tall')).toMatchObject({ shape: 'phone', size: 'fhd', format: 'JPG' });
  });

  it('marks own wallpapers as such and downloads them from this repository', () => {
    expect(find('solid-blue')).toMatchObject({ sourceId: 'own', alsoIn: [], download: rawUrl('Solid Blue.png') });
  });

  it('fingerprints every wallpaper with a 16-hex-digit hash, kept in the cache by key and SHA', async () => {
    for (const derived of first.derived.values()) expect(derived.phash).toMatch(HEX16);
    for (const wallpaper of wallpapers) expect(wallpaper.phash, wallpaper.slug).toMatch(HEX16);
    const [tallItem] = await ownItems([entries[1]]);
    const cache = JSON.parse(await readFile(opts.cacheFile, 'utf8'));
    expect(cache['own:tall.jpg']).toMatchObject({
      sha: tallItem.sha,
      version: PIPELINE_VERSION,
      derived: { phash: find('tall').phash },
    });
  });

  it('hashes the same still frame as dHash does', async () => {
    const bytes = await readFile(join(imagesDir, 'tall.jpg'));
    expect(hamming(find('tall').phash, await dHash(bytes))).toBe(0);
  });

  it('reads the palette of a solid image as that one colour', () => {
    expect(find('solid-blue').palette[0]).toEqual({ hex: '#336699', share: 1 });
    expect(find('solid-blue').colors).toEqual(['blue']);
  });

  it('turns an animation into a single still frame and marks it as animated', async () => {
    const thumbnail = await metadataOf(opts.outDir, 't/loop.webp');
    expect(thumbnail.pages ?? 1).toBe(1);
    expect(find('loop')).toMatchObject({ animated: true, width: 1920, height: 1080, format: 'GIF' });
  });

  it('flattens transparency onto the site background before reading colours', () => {
    expect(hexDistance(find('clear').palette[0].hex, '#0a0d0c')).toBeLessThan(8);
  });

  it('lists featured wallpapers first, in an order that does not depend on the input order', () => {
    const ordered = catalogOrder(wallpapers);
    expect(ordered.map((w) => Boolean(w.featured))).toEqual([true, true, false, false]);
    expect(catalogOrder([...wallpapers].reverse())).toEqual(ordered);
  });

  it('does no work and reads nothing on a second run', async () => {
    const items = (await ownItems()).map(unreadable);
    expect(await buildMedia(items, opts)).toMatchObject({ processed: 0, cached: 4, failed: [] });
  });

  it('reprocesses only the file whose bytes changed', async () => {
    await writeSolid('#993333');
    const again = await buildMedia(await ownItems(), opts);
    expect(again).toMatchObject({ processed: 1, cached: 3 });
    expect(ownWallpaper(entries[0], again.derived.get('own:Solid Blue.png')!).colors).toEqual(['red']);
  });

  it('deletes the images of a wallpaper that left the catalog', async () => {
    await buildMedia(await ownItems(entries.slice(1)), opts);
    expect(existsSync(join(opts.outDir, 't/solid-blue.webp'))).toBe(false);
    expect(existsSync(join(opts.outDir, 'og/solid-blue.jpg'))).toBe(false);
    expect(existsSync(join(opts.outDir, 't/tall.webp'))).toBe(true);
  });
});

describe('measureOriginal', () => {
  it('measures as the media step does and makes the very preview it writes', async () => {
    const mopts = { outDir: join(root, 'out-measure'), cacheFile: join(root, 'cache', 'media-measure.json') };
    const [tall, loop] = await ownItems([entries[1], entries[2]]);
    const built = await buildMedia([tall, loop], mopts);
    for (const item of [tall, loop]) {
      const { derived, preview } = await measureOriginal(await item.read());
      expect(derived).toEqual(built.derived.get(item.key));
      expect(preview.equals(await readFile(join(mopts.outDir, 'p', `${item.slug}.webp`)))).toBe(true);
    }
  });
});

describe('buildMedia with files of indexed collections', () => {
  // Own folders, so these builds do not prune or recache the ones above.
  let iopts: MediaOptions;
  let stripesOwn: MediaItem;
  let stripesBytes: Buffer;
  const stripesEntry: Entry = { file: 'stripes.png', title: 'Stripes', tags: ['a', 'b'] };
  const copyKey = 'nordic:wallpapers/stripes copy.jpg';
  const dottedKey = 'gruvbox:wallpapers/stripes dotted.png';
  const copyBytes = () => sharp(stripesBytes).resize({ width: 960 }).jpeg({ quality: 80 }).toBuffer();
  // The same pixels with a white dot on the blue: shortlisted, but not a copy.
  const dot = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="40" fill="#fff"/></svg>');
  const dottedBytes = () => sharp(stripesBytes).composite([{ input: dot, left: 66, top: 567 }]).png().toBuffer();
  const copyItem = { key: copyKey, slug: 'stripes-copy-nordic', sha: 'c1' };
  const dottedItem = { key: dottedKey, slug: 'stripes-dotted-gruvbox', sha: 'd1' };

  beforeAll(async () => {
    iopts = { outDir: join(root, 'out-indexed'), cacheFile: join(root, 'cache', 'media-indexed.json') };
    // Blue with a light stripe in every other column of the fingerprint: each pair of
    // neighbouring columns differs clearly in brightness, and blue stays the first swatch.
    const bars = [1, 3, 5, 7].map((column) => `<rect x="${Math.round(((column + 0.5) * 1920) / 9) - 60}" width="120" height="1080" fill="#c8d8e8"/>`);
    const stripes = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#2a4d8e"/>${bars.join('')}</svg>`;
    await sharp(Buffer.from(stripes)).png().toFile(join(imagesDir, stripesEntry.file));
    [stripesOwn] = await ownItems([stripesEntry]);
    stripesBytes = await readFile(join(imagesDir, stripesEntry.file));
  });

  it('builds the images of an indexed file from its original, and measures its fingerprint', async () => {
    const copy = counted(copyItem, copyBytes);
    const dotted = counted(dottedItem, dottedBytes);
    const result = await buildMedia([stripesOwn, copy.item, dotted.item], iopts);
    expect(result).toMatchObject({ processed: 3, cached: 0, failed: [] });
    expect([copy.calls.reads, dotted.calls.reads]).toEqual([1, 1]);
    expect(result.derived.get(copyKey)).toMatchObject({ width: 960, height: 540, animated: false });
    expect(result.derived.get(copyKey)!.phash).toMatch(HEX16);
    for (const path of ['t/stripes-copy-nordic.webp', 't/stripes-copy-nordic@2x.webp', 'p/stripes-copy-nordic.webp', 'og/stripes-copy-nordic.jpg']) {
      expect(existsSync(join(iopts.outDir, path)), path).toBe(true);
    }
  });

  it('does not read an indexed file whose cache entry matches its key and SHA', async () => {
    const items = [stripesOwn, unreadable({ ...copyItem, read: copyBytes }), unreadable({ ...dottedItem, read: dottedBytes })];
    const result = await buildMedia(items, iopts);
    expect(result).toMatchObject({ processed: 0, cached: 3, failed: [] });
    expect(result.derived.get(copyKey)).toMatchObject({ width: 960, height: 540 });
    expect(result.derived.get(copyKey)!.phash).toMatch(HEX16);
  });

  it('reads a file whose SHA changed once, and only that one', async () => {
    const copy = counted({ ...copyItem, sha: 'c2' }, copyBytes);
    const result = await buildMedia([stripesOwn, copy.item, unreadable({ ...dottedItem, read: dottedBytes })], iopts);
    expect(result).toMatchObject({ processed: 1, cached: 2, failed: [] });
    expect(copy.calls.reads).toBe(1);
    const cache = JSON.parse(await readFile(iopts.cacheFile, 'utf8'));
    expect(cache[copyKey]).toMatchObject({ sha: 'c2', version: PIPELINE_VERSION });
  });

  it('leaves out a file whose original cannot be read, and builds the rest', async () => {
    const broken = counted({ key: 'nordic:wallpapers/gone.png', slug: 'gone-nordic', sha: 'g1' }, async () => {
      throw new Error('answered 404');
    });
    const items = [stripesOwn, { ...copyItem, sha: 'c2', read: copyBytes }, { ...dottedItem, read: dottedBytes }, broken.item];
    const result = await buildMedia(items, iopts);
    expect(result).toMatchObject({ processed: 0, cached: 3 });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].item.key).toBe('nordic:wallpapers/gone.png');
    expect(result.failed[0].error.message).toContain('answered 404');
    expect(result.derived.has('nordic:wallpapers/gone.png')).toBe(false);
    expect(existsSync(join(iopts.outDir, 't/gone-nordic.webp'))).toBe(false);
    const cache = JSON.parse(await readFile(iopts.cacheFile, 'utf8'));
    expect(Object.keys(cache).sort()).toEqual([copyKey, dottedKey, 'own:stripes.png'].sort());
  });

  it('refuses two items that would write the same images', async () => {
    const clash = { key: 'nordic:other.png', slug: 'stripes', sha: 'x', read: copyBytes };
    await expect(buildMedia([stripesOwn, clash], iopts)).rejects.toThrow(/own:stripes\.png and nordic:other\.png/);
  });

  describe('thumbnailsMatch', () => {
    const nordic: Source = {
      id: 'nordic', short: 'nordic', name: 'Nordic', repo: 'o/nordic', branch: 'main',
      include: [], exclude: [], tags: [], folders: {}, status: 'active',
    };
    const gruvbox: Source = { ...nordic, id: 'gruvbox', short: 'gruvbox', name: 'Gruvbox', repo: 'o/gruvbox' };
    let own: Wallpaper;
    let copy: Wallpaper;
    let dotted: Wallpaper;

    function approved(path: string, slug: string, derived: Derived): ApprovedFile {
      const { width, height, bytes, animated, palette, phash } = derived;
      return { path, sha: 'x', slug, title: slug, tags: ['a', 'b'], width, height, bytes, animated, palette, phash };
    }

    beforeAll(async () => {
      const items = [stripesOwn, { ...copyItem, sha: 'c2', read: copyBytes }, { ...dottedItem, read: dottedBytes }];
      const { derived } = await buildMedia(items, iopts);
      own = ownWallpaper(stripesEntry, derived.get('own:stripes.png')!);
      copy = toWallpaper(nordic, approved('wallpapers/stripes copy.jpg', copyItem.slug, derived.get(copyKey)!));
      dotted = toWallpaper(gruvbox, approved('wallpapers/stripes dotted.png', dottedItem.slug, derived.get(dottedKey)!));
    });

    it('accepts a smaller copy of the same picture and rejects one that differs in a small spot', async () => {
      const confirm = thumbnailsMatch(iopts.outDir);
      expect(await confirm(own, copy)).toBe(true);
      expect(await confirm(own, dotted)).toBe(false);
    });

    it('lets mergeDuplicates fold an indexed copy into the own wallpaper and keep the different one', async () => {
      // Both pass the shortlist (fingerprint and first swatch), so only the thumbnails tell them apart.
      for (const other of [copy, dotted]) {
        expect(hamming(own.phash, other.phash), other.slug).toBeLessThanOrEqual(6);
        expect(hexDistance(own.palette[0].hex, other.palette[0].hex), other.slug).toBeLessThanOrEqual(24);
      }
      const merged = await mergeDuplicates([own, copy, dotted], thumbnailsMatch(iopts.outDir));
      expect(merged.map((w) => [w.slug, w.alsoIn])).toEqual([
        ['stripes', ['nordic']],
        ['stripes-dotted-gruvbox', []],
      ]);
    });

    it('compares at most eight pairs at once', async () => {
      let active = 0;
      let peak = 0;
      const compare = async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return true;
      };
      const confirm = thumbnailsMatch(iopts.outDir, compare);
      const answers = await Promise.all(Array.from({ length: 30 }, () => confirm(own, copy)));
      expect(answers).toEqual(Array(30).fill(true));
      expect(peak).toBeLessThanOrEqual(8);
      expect(peak).toBeGreaterThan(1);
    });
  });
});

describe('buildHomeOg', () => {
  it('writes a 1200 by 630 collage even with fewer than six featured wallpapers', async () => {
    const { derived } = await buildMedia(await ownItems(), opts);
    const wallpapers = catalogOrder(entries.map((entry) => ownWallpaper(entry, derived.get(`own:${entry.file}`)!)));
    await buildHomeOg(wallpapers, opts);
    const og = await metadataOf(opts.outDir, 'og/home.jpg');
    expect([og.width, og.height]).toEqual([1200, 630]);
  });
});
