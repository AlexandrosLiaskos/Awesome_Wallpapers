import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildHomeOg, buildMedia, type MediaOptions } from '../../scripts/lib/media.ts';
import type { Entry, Wallpaper } from '../../src/lib/types.ts';

let root: string;
let opts: MediaOptions;

const entries: Entry[] = [
  { file: 'Solid Blue.png', title: 'Solid Blue', tags: ['a', 'b'] },
  { file: 'tall.jpg', title: 'Tall', tags: ['a', 'b'], featured: true },
  { file: 'loop.gif', title: 'Loop', tags: ['a', 'b'] },
  { file: 'clear.png', title: 'Clear', tags: ['a', 'b'], featured: true },
];

function blank(width: number, height: number, background: string | object) {
  return sharp({ create: { width, height, channels: 4, background } });
}

async function writeSolid(colour: string) {
  await blank(1920, 1080, colour).png().toFile(join(opts.imagesDir, 'Solid Blue.png'));
}

// Read through a buffer: on Windows libvips keeps a file it opened by path locked.
async function metadataOf(path: string) {
  return sharp(await readFile(join(opts.outDir, path))).metadata();
}

function hexDistance(a: string, b: string): number {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'aw-media-'));
  opts = {
    imagesDir: join(root, 'images'),
    outDir: join(root, 'out'),
    cacheFile: join(root, 'cache', 'media.json'),
    catalogOut: join(root, 'generated', 'catalog.json'),
  };
  const { mkdir } = await import('node:fs/promises');
  await mkdir(opts.imagesDir, { recursive: true });
  await writeSolid('#336699');
  await blank(1080, 2340, '#cc3344').jpeg().toFile(join(opts.imagesDir, 'tall.jpg'));
  const frames = await Promise.all(['#112233', '#445566'].map((c) => blank(1920, 1080, c).png().toBuffer()));
  await sharp(frames, { join: { animated: true } }).gif().toFile(join(opts.imagesDir, 'loop.gif'));
  await blank(1920, 1080, { r: 0, g: 0, b: 0, alpha: 0 }).png().toFile(join(opts.imagesDir, 'clear.png'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('buildMedia', () => {
  let first: Awaited<ReturnType<typeof buildMedia>>;
  const find = (slug: string) => first.wallpapers.find((w) => w.slug === slug) as Wallpaper;

  beforeAll(async () => {
    first = await buildMedia(entries, opts);
  });

  it('processes every entry on the first run', () => {
    expect(first).toMatchObject({ processed: 4, cached: 0 });
  });

  it('writes a thumbnail, a 2x thumbnail, a preview and a share image per wallpaper', () => {
    for (const slug of ['solid-blue', 'tall', 'loop', 'clear']) {
      for (const path of [`t/${slug}.webp`, `t/${slug}@2x.webp`, `p/${slug}.webp`, `og/${slug}.jpg`]) {
        expect(existsSync(join(opts.outDir, path)), path).toBe(true);
      }
    }
  });

  it('makes thumbnails 300 px high, and 600 px at 2x', async () => {
    expect((await metadataOf('t/solid-blue.webp')).height).toBe(300);
    expect((await metadataOf('t/solid-blue@2x.webp')).height).toBe(600);
  });

  it('keeps previews within 1600 px on both sides without enlarging', async () => {
    const wide = await metadataOf('p/solid-blue.webp');
    const tall = await metadataOf('p/tall.webp');
    expect([wide.width, wide.height]).toEqual([1600, 900]);
    expect(tall.height).toBe(1600);
  });

  it('makes share images 1200 by 630', async () => {
    const og = await metadataOf('og/tall.jpg');
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

  it('reads the palette of a solid image as that one colour', () => {
    expect(find('solid-blue').palette[0]).toEqual({ hex: '#336699', share: 1 });
    expect(find('solid-blue').colors).toEqual(['blue']);
  });

  it('turns an animation into a single still frame and marks it as animated', async () => {
    const thumbnail = await metadataOf('t/loop.webp');
    expect(thumbnail.pages ?? 1).toBe(1);
    expect(find('loop')).toMatchObject({ animated: true, width: 1920, height: 1080, format: 'GIF' });
  });

  it('flattens transparency onto the site background before reading colours', () => {
    expect(hexDistance(find('clear').palette[0].hex, '#0a0d0c')).toBeLessThan(8);
  });

  it('lists featured wallpapers first', () => {
    const featured = first.wallpapers.map((w) => Boolean(w.featured));
    expect(featured).toEqual([true, true, false, false]);
  });

  it('writes the same list to the catalog file', async () => {
    const written = JSON.parse(await readFile(opts.catalogOut, 'utf8'));
    expect(written).toEqual(first.wallpapers);
  });

  it('does no work on a second run', async () => {
    expect(await buildMedia(entries, opts)).toMatchObject({ processed: 0, cached: 4 });
  });

  it('reprocesses only the file whose bytes changed', async () => {
    await writeSolid('#993333');
    const again = await buildMedia(entries, opts);
    expect(again).toMatchObject({ processed: 1, cached: 3 });
    expect(again.wallpapers.find((w) => w.slug === 'solid-blue')!.colors).toEqual(['red']);
  });

  it('deletes the images of a wallpaper that left the catalog', async () => {
    await buildMedia(entries.slice(1), opts);
    expect(existsSync(join(opts.outDir, 't/solid-blue.webp'))).toBe(false);
    expect(existsSync(join(opts.outDir, 'og/solid-blue.jpg'))).toBe(false);
    expect(existsSync(join(opts.outDir, 't/tall.webp'))).toBe(true);
  });
});

describe('buildHomeOg', () => {
  it('writes a 1200 by 630 collage even with fewer than six featured wallpapers', async () => {
    const { wallpapers } = await buildMedia(entries, opts);
    await buildHomeOg(wallpapers, opts);
    const og = await metadataOf('og/home.jpg');
    expect([og.width, og.height]).toEqual([1200, 630]);
  });
});
