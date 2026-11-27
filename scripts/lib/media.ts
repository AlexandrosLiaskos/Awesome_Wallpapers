import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { slugOf } from '../../src/lib/catalog.ts';
import { aspectLabel, formatOf, shapeOf, sizeClass } from '../../src/lib/classify.ts';
import { bucketsOf, paletteFromRgb } from '../../src/lib/colors.ts';
import type { Confirm } from '../../src/lib/dedup.ts';
import { rawUrl } from '../../src/lib/slug.ts';
import type { Entry, Swatch, Wallpaper } from '../../src/lib/types.ts';
import { dHashOfFrame } from './phash.ts';
import { mapLimit } from './scan.ts';
import { looksIdentical } from './similar.ts';

/** Bump when sizes, qualities or measurements change, so every image is rebuilt. */
export const PIPELINE_VERSION = 3;

export interface MediaOptions {
  /** Where thumbnails, previews and share images go. */
  outDir: string;
  /** Remembers what was already built, by item key. */
  cacheFile: string;
}

/** An original to build images for: a file in images/, or an approved file of an indexed collection. */
export interface MediaItem {
  /** Names the original in the cache: `own:<file>`, or `<collection id>:<path>`. */
  key: string;
  /** The images are named after it. */
  slug: string;
  /** Fingerprint of the content: the SHA-1 of an own file, the Git blob SHA of an indexed one. */
  sha: string;
  /** The original's bytes. Only called when the images must be built: for an indexed file it is a download. */
  read: () => Promise<Buffer>;
}

/** What is measured from an original while its images are made. */
export interface Derived {
  width: number;
  height: number;
  bytes: number;
  animated: boolean;
  palette: Swatch[];
  phash: string;
}

export interface MediaResult {
  /** What was measured, by item key. A failed item is not here. */
  derived: Map<string, Derived>;
  /** Items whose original could not be read or processed; they have no images. */
  failed: { item: MediaItem; error: Error }[];
  processed: number;
  cached: number;
}

/** The site background; transparent images are composed onto it. */
const BACKGROUND = '#0a0d0c';
const THUMB_HEIGHT = 300;
const PREVIEW_EDGE = 1280;
const CONCURRENCY = 4;
/** mergeDuplicates asks about every candidate of a copy at once; this many thumbnail pairs are compared at a time. */
const COMPARISONS = 8;

type Cache = Record<string, { sha: string; version: number; derived: Derived }>;

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

/** An original decoded once: its first frame, upright, on the site background, and what it measures. */
async function decode(bytes: Buffer): Promise<{ frame: () => Sharp; derived: Derived }> {
  const { pages = 1 } = await sharp(bytes).metadata();
  const still = sharp(bytes, { pages: 1 }).rotate().flatten({ background: BACKGROUND });
  const { data, info } = await still.clone().raw().toBuffer({ resolveWithObject: true });
  const frame = () => sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });

  const sample = await frame().resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const derived: Derived = {
    width: info.width,
    height: info.height,
    bytes: bytes.length,
    animated: pages > 1,
    palette: paletteFromRgb(new Uint8Array(sample)).map((swatch) => ({
      hex: swatch.hex,
      share: Math.round(swatch.share * 1000) / 1000,
    })),
    phash: await dHashOfFrame(frame()),
  };
  return { frame, derived };
}

const previewOf = (frame: Sharp): Sharp =>
  frame.resize({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 });

async function derive(bytes: Buffer, outDir: string, slug: string): Promise<Derived> {
  const { frame, derived } = await decode(bytes);
  const [thumb, thumb2x, preview, og] = outputsOf(outDir, slug);
  await Promise.all([
    frame().resize({ height: THUMB_HEIGHT }).webp({ quality: 72 }).toFile(thumb),
    frame()
      .resize({ height: THUMB_HEIGHT * 2, withoutEnlargement: true })
      .webp({ quality: 60 })
      .toFile(thumb2x),
    previewOf(frame()).toFile(preview),
    frame().resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 70, mozjpeg: true }).toFile(og),
  ]);
  return derived;
}

/**
 * What the media step would measure from an original and the preview it would write, without
 * writing anything. The taggers were calibrated on these previews, so sync tags new files from
 * exactly this image.
 */
export async function measureOriginal(bytes: Buffer): Promise<{ derived: Derived; preview: Buffer }> {
  const { frame, derived } = await decode(bytes);
  return { derived, preview: await previewOf(frame()).toBuffer() };
}

/** Removes generated files that belong to no item. */
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

/** Two items with one slug would overwrite each other's images. */
function assertDistinctSlugs(items: MediaItem[]): void {
  const keyOf = new Map<string, string>();
  for (const item of items) {
    const other = keyOf.get(item.slug);
    if (other !== undefined) throw new Error(`${other} and ${item.key} have the same slug "${item.slug}"`);
    keyOf.set(item.slug, item.key);
  }
}

/**
 * Builds the thumbnails, previews and share image of every item and measures it.
 * An item is rebuilt only when its SHA or the pipeline version change or an image
 * is missing; otherwise its original is not read at all. An item that fails is
 * reported in `failed` and the others are still built. Images of anything not in
 * `items` are deleted.
 */
export async function buildMedia(items: MediaItem[], opts: MediaOptions): Promise<MediaResult> {
  assertDistinctSlugs(items);
  for (const folder of ['t', 'p', 'og']) await mkdir(join(opts.outDir, folder), { recursive: true });
  const cache = await readCache(opts.cacheFile);
  let processed = 0;

  const outcomes = await mapLimit(items, CONCURRENCY, async (item) => {
    const hit = cache[item.key];
    const fresh =
      hit && hit.sha === item.sha && hit.version === PIPELINE_VERSION && outputsOf(opts.outDir, item.slug).every(existsSync);
    if (fresh) return { item, derived: hit.derived };
    try {
      const derived = await derive(await item.read(), opts.outDir, item.slug);
      processed += 1;
      return { item, derived };
    } catch (error) {
      return { item, error: error instanceof Error ? error : new Error(String(error)) };
    }
  });

  const derived = new Map<string, Derived>();
  const failed: MediaResult['failed'] = [];
  const nextCache: Cache = {};
  for (const outcome of outcomes) {
    if (outcome.error) {
      failed.push({ item: outcome.item, error: outcome.error });
      continue;
    }
    const { item } = outcome;
    derived.set(item.key, outcome.derived);
    nextCache[item.key] = { sha: item.sha, version: PIPELINE_VERSION, derived: outcome.derived };
  }

  const keep = new Set(items.filter((item) => derived.has(item.key)).flatMap((item) => outputsOf(opts.outDir, item.slug)));
  keep.add(join(opts.outDir, 'og', 'home.jpg'));
  await prune(opts.outDir, keep);

  await mkdir(dirname(opts.cacheFile), { recursive: true });
  await writeFile(opts.cacheFile, JSON.stringify(nextCache));

  return { derived, failed, processed, cached: items.length - processed - failed.length };
}

/** A wallpaper of images/ as an item; `sha` is the SHA-1 of the file (see `scanImages`). */
export function ownItem(entry: Entry, imagesDir: string, sha: string): MediaItem {
  return { key: `own:${entry.file}`, slug: slugOf(entry), sha, read: () => readFile(join(imagesDir, entry.file)) };
}

/** An entry of wallpapers.yml with what was measured from its file. */
export function ownWallpaper(entry: Entry, derived: Derived): Wallpaper {
  const { width, height } = derived;
  return {
    ...entry,
    slug: slugOf(entry),
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
    download: rawUrl(entry.file),
    sourceId: 'own',
    alsoIn: [],
    phash: derived.phash,
  };
}

/** The order of the catalog: featured wallpapers first, each part in a fixed, shuffled-looking order. */
export function catalogOrder(wallpapers: Wallpaper[]): Wallpaper[] {
  const keys = new Map(wallpapers.map((w) => [w.slug, orderKey(w.slug)]));
  const byOrder = (a: Wallpaper, b: Wallpaper) => keys.get(a.slug)!.localeCompare(keys.get(b.slug)!);
  return [...wallpapers.filter((w) => w.featured).sort(byOrder), ...wallpapers.filter((w) => !w.featured).sort(byOrder)];
}

/** Runs at most `max` tasks at a time; the others wait for a place. */
function limiter(max: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running < max) running += 1;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      // The place passes straight to the next task, so a newcomer cannot take it in between.
      const next = waiting.shift();
      if (next) next();
      else running -= 1;
    }
  };
}

/**
 * The picture check for `mergeDuplicates`: whether the thumbnails this step wrote
 * for two wallpapers show the same picture (see `looksIdentical`).
 */
export function thumbnailsMatch(
  outDir: string,
  compare: (a: Buffer, b: Buffer) => Promise<boolean> = looksIdentical,
): Confirm {
  const limit = limiter(COMPARISONS);
  // Read into memory first: libvips keeps files it opens by path locked on Windows.
  const thumbnail = (wallpaper: Wallpaper) => readFile(join(outDir, 't', `${wallpaper.slug}.webp`));
  return (a, b) =>
    limit(async () => {
      const [x, y] = await Promise.all([thumbnail(a), thumbnail(b)]);
      return compare(x, y);
    });
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
