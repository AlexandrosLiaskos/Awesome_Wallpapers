// Calibrates the palette thresholds against the hand-tagged wallpapers and writes them to
// data/tagger.json under "palettes". Run by hand after `npm run build` has made public/m/p:
//
//   node scripts/eval-palettes.ts
//
// A palette's threshold is the lowest coverage (so the highest recall) at which at least
// MIN_PRECISION of the wallpapers at or above it are hand-tagged with that palette, and at
// least MIN_TRUE_POSITIVES of them are. A palette that cannot get there is written as null
// and never assigned.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { slugOf } from '../src/lib/catalog.ts';
import { PALETTES, paletteCoverage, type PaletteSlug } from '../src/lib/palettes.ts';
import { loadCatalog } from './lib/load.ts';

const MIN_PRECISION = 0.8;
/** A lucky single hit must not set a threshold. */
const MIN_TRUE_POSITIVES = 3;
const SAMPLE = 64;
const PREVIEW_DIR = join('public', 'm', 'p');
const TAGGER_FILE = join('data', 'tagger.json');

interface Scored {
  coverage: number;
  tagged: boolean;
}

interface Result {
  threshold: number | null;
  /** The best precision seen at any level with enough true positives, shown when no level reached MIN_PRECISION. */
  bestPrecision: number;
  precision: number;
  recall: number;
  truePositives: number;
  total: number;
}

function chooseThreshold(scored: Scored[]): Result {
  const total = scored.filter((item) => item.tagged).length;
  const levels = [...new Set(scored.map((item) => item.coverage))].sort((a, b) => b - a);
  let best: Result = { threshold: null, bestPrecision: 0, precision: 0, recall: 0, truePositives: 0, total };
  let bestPrecision = 0;
  // Walking down from the strictest level, recall only grows, so the last level that still
  // passes is the one with the highest recall.
  for (const level of levels) {
    const above = scored.filter((item) => item.coverage >= level);
    const truePositives = above.filter((item) => item.tagged).length;
    const precision = truePositives / above.length;
    if (truePositives >= MIN_TRUE_POSITIVES) bestPrecision = Math.max(bestPrecision, precision);
    if (precision >= MIN_PRECISION && truePositives >= MIN_TRUE_POSITIVES) {
      best = { threshold: level, bestPrecision, precision, recall: total === 0 ? 0 : truePositives / total, truePositives, total };
    }
  }
  return { ...best, bestPrecision };
}

async function sampleOf(slug: string): Promise<Uint8Array> {
  // Through a Buffer, so libvips does not keep the file locked on Windows.
  const { data } = await sharp(await readFile(join(PREVIEW_DIR, `${slug}.webp`)))
    .flatten({ background: '#000000' })
    .resize(SAMPLE, SAMPLE, { fit: 'fill' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}

const { entries, tags } = await loadCatalog();
const paletteSlugs = new Set(tags.filter((tag) => tag.kind === 'palette').map((tag) => tag.slug));
const slugs = Object.keys(PALETTES) as PaletteSlug[];

const samples: { tags: Set<string>; rgb: Uint8Array }[] = [];
for (const entry of entries) {
  const slug = slugOf(entry);
  try {
    samples.push({ tags: new Set(entry.tags.filter((tag) => paletteSlugs.has(tag))), rgb: await sampleOf(slug) });
  } catch (error) {
    throw new Error(`no preview for ${entry.file} (${PREVIEW_DIR}/${slug}.webp); run npm run build first (${(error as Error).message})`);
  }
}

const thresholds: Record<string, number | null> = {};
const rows: string[] = ['palette        tagged  threshold  precision  recall  true positives  best precision'];
for (const slug of slugs) {
  const scored = samples.map((sample) => ({ coverage: paletteCoverage(sample.rgb, PALETTES[slug]), tagged: sample.tags.has(slug) }));
  const result = chooseThreshold(scored);
  // Rounded down so that the stored value still includes every wallpaper that set it.
  thresholds[slug] = result.threshold === null ? null : Math.floor(result.threshold * 10000) / 10000;
  rows.push(
    [
      slug.padEnd(14),
      String(result.total).padStart(6),
      (thresholds[slug] === null ? 'null' : thresholds[slug]!.toFixed(4)).padStart(10),
      result.threshold === null ? '-'.padStart(10) : result.precision.toFixed(3).padStart(10),
      result.threshold === null ? '-'.padStart(7) : result.recall.toFixed(3).padStart(7),
      String(result.truePositives).padStart(15),
      result.bestPrecision.toFixed(3).padStart(15),
    ].join(' '),
  );
}
console.log(`${samples.length} wallpapers, minimum ${MIN_TRUE_POSITIVES} true positives, precision >= ${MIN_PRECISION}\n`);
console.log(rows.join('\n'));

// tagger.json is shared with the other taggers: only "palettes" is ours.
let existing: Record<string, unknown> = {};
try {
  existing = JSON.parse(await readFile(TAGGER_FILE, 'utf8'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const merged = { ...existing, palettes: Object.fromEntries(Object.entries(thresholds).sort(([a], [b]) => a.localeCompare(b))) };
const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(TAGGER_FILE, JSON.stringify(sorted, null, 2) + '\n');
console.log(`\nWrote ${TAGGER_FILE}`);
