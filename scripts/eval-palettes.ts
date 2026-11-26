// Calibrates the palette settings against the hand-tagged wallpapers and writes them to
// data/tagger.json under "palettes". Run by hand after `npm run build` has made public/m/p:
//
//   node scripts/eval-palettes.ts
//
// For each palette it tries every distance in DELTA_E_GRID and every observed coverage as a
// threshold, and keeps the pair with the highest recall among those where at least
// MIN_PRECISION of the wallpapers at or above the threshold are hand-tagged with the palette
// and at least MIN_TRUE_POSITIVES of them are. A palette with no such pair is written as null
// and never assigned.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { slugOf } from '../src/lib/catalog.ts';
import {
  DELTA_E_GRID,
  MIN_TRUE_POSITIVES,
  PALETTES,
  paletteCoverage,
  type PaletteSetting,
  type PaletteSlug,
} from '../src/lib/palettes.ts';
import { loadCatalog } from './lib/load.ts';

const MIN_PRECISION = 0.8;
/** Long edge of the sample; nearest-neighbour keeps palette colours from blending into others. */
const SAMPLE_EDGE = 256;
const PREVIEW_DIR = join('public', 'm', 'p');
const TAGGER_FILE = join('data', 'tagger.json');

interface Scored {
  coverage: number;
  tagged: boolean;
}

interface Result {
  setting: PaletteSetting;
  precision: number;
  recall: number;
  truePositives: number;
  total: number;
  /** The best precision seen at any level with enough true positives, for palettes that have no setting. */
  bestPrecision: number;
}

function chooseSetting(byDeltaE: Map<number, Scored[]>): Result {
  let total = 0;
  let best: Result | null = null;
  let bestPrecision = 0;
  for (const [deltaE, scored] of byDeltaE) {
    total = scored.filter((item) => item.tagged).length;
    for (const level of new Set(scored.map((item) => item.coverage))) {
      const above = scored.filter((item) => item.coverage >= level);
      const truePositives = above.filter((item) => item.tagged).length;
      const precision = truePositives / above.length;
      if (truePositives < MIN_TRUE_POSITIVES) continue;
      bestPrecision = Math.max(bestPrecision, precision);
      if (precision < MIN_PRECISION) continue;
      const recall = truePositives / total;
      // Same recall: prefer the higher precision, then the stricter threshold.
      const better =
        !best ||
        recall > best.recall ||
        (recall === best.recall && (precision > best.precision || (precision === best.precision && level > best.setting!.threshold)));
      // Rounded down to 4 places so that the stored value still includes the wallpaper that set it.
      if (better) best = { setting: { deltaE, threshold: Math.floor(level * 10000) / 10000 }, precision, recall, truePositives, total, bestPrecision: 0 };
    }
  }
  return { ...(best ?? { setting: null, precision: 0, recall: 0, truePositives: 0, total }), bestPrecision };
}

async function sampleOf(slug: string): Promise<Uint8Array> {
  // Through a Buffer, so libvips does not keep the file locked on Windows.
  const { data } = await sharp(await readFile(join(PREVIEW_DIR, `${slug}.webp`)))
    .flatten({ background: '#000000' })
    .resize(SAMPLE_EDGE, SAMPLE_EDGE, { fit: 'inside', kernel: 'nearest' })
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

const settings: Record<string, PaletteSetting> = {};
const rows: string[] = ['palette        tagged  deltaE  threshold  precision  recall  true positives  best precision'];
for (const slug of slugs) {
  const byDeltaE = new Map<number, Scored[]>();
  for (const deltaE of DELTA_E_GRID) {
    byDeltaE.set(
      deltaE,
      samples.map((sample) => ({ coverage: paletteCoverage(sample.rgb, PALETTES[slug], deltaE), tagged: sample.tags.has(slug) })),
    );
  }
  const result = chooseSetting(byDeltaE);
  settings[slug] = result.setting;
  const found = result.setting !== null;
  rows.push(
    [
      slug.padEnd(14),
      String(result.total).padStart(6),
      (found ? String(result.setting!.deltaE) : '-').padStart(7),
      (found ? result.setting!.threshold.toFixed(4) : 'null').padStart(10),
      (found ? result.precision.toFixed(3) : '-').padStart(10),
      (found ? result.recall.toFixed(3) : '-').padStart(7),
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
const merged = { ...existing, palettes: Object.fromEntries(Object.entries(settings).sort(([a], [b]) => a.localeCompare(b))) };
const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(TAGGER_FILE, JSON.stringify(sorted, null, 2) + '\n');
console.log(`\nWrote ${TAGGER_FILE}`);
