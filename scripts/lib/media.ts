import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { slugOf } from '../../src/lib/catalog.ts';
import { aspectLabel, formatOf, shapeOf, sizeClass } from '../../src/lib/classify.ts';
import { bucketsOf, paletteFromRgb } from '../../src/lib/colors.ts';
import type { Entry, Swatch, Wallpaper } from '../../src/lib/types.ts';
import { mapLimit } from './scan.ts';

/** Bump when sizes or qualities change, so every image is rebuilt. */
export const PIPELINE_VERSION = 2;

export interface MediaOptions {
  /** The originals. */
  imagesDir: string;
  /** Where thumbnails, previews and share images go. */
  outDir: string;
  /** Remembers what was already built, keyed by filename. */
  cacheFile: string;
  /** The JSON list of wallpapers the site is rendered from. */
  catalogOut: string;
}

/** The site background; transparent images are composed onto it. */
const BACKGROUND = '#0a0d0c';
const THUMB_HEIGHT = 300;
const PREVIEW_EDGE = 1280;
const CONCURRENCY = 4;

interface Derived {
  width: number;
  height: number;
  bytes: number;
  animated: boolean;
  palette: Swatch[];
}

type Cache = Record<string, { sha1: string; version: number; derived: Derived }>;

function outputsOf(outDir: string, slug: string): string[] {
  return [`t/${slug}.webp`, `t/${slug}@2x.webp`, `p/${slug}.webp`, `og/${slug}.jpg`].map((path) => join(outDir, path));
}

async function readCache(cacheFile: string): Promise<Cache> {
  try {
    return JSON.parse(await readFile(cacheFile, 'utf8')) as Cache;
  } catch {
    return {};
  }
}

async function derive(bytes: Buffer, outDir: string, slug: string): Promise<Derived> {
  const { pages = 1 } = await sharp(bytes).metadata();
  // First frame only, upright, on the site background.
  const still = sharp(bytes, { pages: 1 }).rotate().flatten({ background: BACKGROUND });
  const { data, info } = await still.clone().raw().toBuffer({ resolveWithObject: true });
  const frame = () => sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });

  const [thumb, thumb2x, preview, og] = outputsOf(outDir, slug);
  const sample = await frame().resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  await Promise.all([
    frame().resize({ height: THUMB_HEIGHT }).webp({ quality: 72 }).toFile(thumb),
    frame()
      .resize({ height: THUMB_HEIGHT * 2, withoutEnlargement: true })
      .webp({ quality: 60 })
      .toFile(thumb2x),
    frame()
      .resize({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(preview),
    frame().resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 70, mozjpeg: true }).toFile(og),
  ]);

  return {
    width: info.width,
    height: info.height,
    bytes: bytes.length,
    animated: pages > 1,
    palette: paletteFromRgb(new Uint8Array(sample)).map((swatch) => ({
      hex: swatch.hex,
      share: Math.round(swatch.share * 1000) / 1000,
    })),
  };
}

/** Removes generated files whose wallpaper is no longer in the catalog. */
async function prune(outDir: string, keep: Set<string>): Promise<void> {
  for (const folder of ['t', 'p', 'og']) {
    const dir = join(outDir, folder);
    if (!existsSync(dir)) continue;
    for (const name of await readdir(dir)) {
      if (!keep.has(join(dir, name))) await rm(join(dir, name));
    }
  }
}

/** A fixed, shuffled-looking order, so similar filenames do not sit together. */
function orderKey(slug: string): string {
  return createHash('sha1').update(slug).digest('hex');
}

/**
 * Builds every derived image and the catalog the site renders from.
 * An image is rebuilt only when its bytes or the pipeline version change.
 */
export async function buildMedia(
  entries: Entry[],
  opts: MediaOptions,
): Promise<{ wallpapers: Wallpaper[]; processed: number; cached: number }> {
  for (const folder of ['t', 'p', 'og']) await mkdir(join(opts.outDir, folder), { recursive: true });
  const cache = await readCache(opts.cacheFile);
  const nextCache: Cache = {};
  let processed = 0;

  const wallpapers = await mapLimit(entries, CONCURRENCY, async (entry): Promise<Wallpaper> => {
    const slug = slugOf(entry);
    const bytes = await readFile(join(opts.imagesDir, entry.file));
    const sha1 = createHash('sha1').update(bytes).digest('hex');
    const hit = cache[entry.file];
    const fresh =
      hit && hit.sha1 === sha1 && hit.version === PIPELINE_VERSION && outputsOf(opts.outDir, slug).every(existsSync);

    let derived: Derived;
    if (fresh) {
      derived = hit.derived;
    } else {
      try {
        derived = await derive(bytes, opts.outDir, slug);
      } catch (error) {
        throw new Error(`images/${entry.file} could not be processed: ${(error as Error).message}`);
      }
      processed += 1;
    }
    nextCache[entry.file] = { sha1, version: PIPELINE_VERSION, derived };

    const { width, height } = derived;
    return {
      ...entry,
      slug,
      width,
      height,
      bytes: derived.bytes,
      format: formatOf(entry.file),
      aspect: aspectLabel(width, height),
      size: sizeClass(width, height),
      shape: shapeOf(width, height),
      palette: derived.palette,
      colors: bucketsOf(derived.palette),
      animated: derived.animated,
    };
  });

  const byOrder = (a: Wallpaper, b: Wallpaper) => orderKey(a.slug).localeCompare(orderKey(b.slug));
  const ordered = [
    ...wallpapers.filter((w) => w.featured).sort(byOrder),
    ...wallpapers.filter((w) => !w.featured).sort(byOrder),
  ];

  const keep = new Set(ordered.flatMap((w) => outputsOf(opts.outDir, w.slug)));
  keep.add(join(opts.outDir, 'og', 'home.jpg'));
  await prune(opts.outDir, keep);

  await mkdir(dirname(opts.cacheFile), { recursive: true });
  await writeFile(opts.cacheFile, JSON.stringify(nextCache));
  await mkdir(dirname(opts.catalogOut), { recursive: true });
  await writeFile(opts.catalogOut, JSON.stringify(ordered, null, 1));

  return { wallpapers: ordered, processed, cached: entries.length - processed };
}

/** The share image of the home page: a 3×2 collage of the first featured wallpapers. */
export async function buildHomeOg(wallpapers: Wallpaper[], opts: MediaOptions): Promise<void> {
  const COLS = 3;
  const ROWS = 2;
  const cell = { width: 1200 / COLS, height: 630 / ROWS };
  const pool = wallpapers.filter((w) => w.shape !== 'phone');
  const picks = (pool.length > 0 ? pool : wallpapers).slice(0, COLS * ROWS);
  if (picks.length === 0) return;

  const tiles = await Promise.all(
    Array.from({ length: COLS * ROWS }, async (_, index) => ({
      // Read into memory first: libvips keeps files it opens by path locked on Windows.
      input: await sharp(await readFile(join(opts.outDir, 'p', `${picks[index % picks.length].slug}.webp`)))
        .resize(cell.width, cell.height, { fit: 'cover', position: 'attention' })
        .toBuffer(),
      left: (index % COLS) * cell.width,
      top: Math.floor(index / COLS) * cell.height,
    })),
  );

  await mkdir(join(opts.outDir, 'og'), { recursive: true });
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: BACKGROUND } })
    .composite(tiles)
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(join(opts.outDir, 'og', 'home.jpg'));
}
