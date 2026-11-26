// Measures how far CLIP can be trusted with subject tags, against the hand-tagged wallpapers,
// and writes a threshold per subject tag to data/tagger.json under "subjects". Run by hand after
// `npm run build` has made public/m/p:
//
//   npm run eval-tagger
//
// The thresholds are judged on wallpapers they were not chosen on: the own wallpapers are split
// into FOLDS folds, each fold is tagged with thresholds chosen (chooseThreshold) on the others,
// and precision and recall are counted over those held-out assignments. The thresholds that are
// written are then chosen on all of them. Exits 1 when the held-out precision of everything it
// assigned is under MIN_PRECISION: subject tags are then not fit to replace hand tagging.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { slugOf } from '../src/lib/catalog.ts';
import { paletteTags, type PaletteSetting } from '../src/lib/palettes.ts';
import { chooseThreshold, MIN_PRECISION, similarities, subjectPrompts, suggestTags } from '../src/lib/suggest.ts';
import { CLIP_MODEL, loadClip } from './lib/clip.ts';
import { loadCatalog } from './lib/load.ts';
import { sampleForPalette } from './lib/palette-sample.ts';

const FOLDS = 5;
const FOLD_SEED = 9;
const PREVIEW_DIR = join('public', 'm', 'p');
const TAGGER_FILE = join('data', 'tagger.json');
// Image embeddings take most of the time and do not depend on the prompts, so they are kept
// between runs, keyed by the preview's own bytes and the model. Delete the file after changing how
// clip.ts prepares an image.
const EMBEDDING_CACHE = join('.cache', 'clip-embeddings.json');

interface Tagger {
  palettes?: Record<string, PaletteSetting>;
  prompts?: Record<string, string>;
  subjects?: Record<string, number | null>;
}

interface EmbeddingCache {
  model: string;
  items: Record<string, { hash: string; embedding: string }>;
}

/** Small deterministic generator (mulberry32), so the folds are the same on every run. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fold number of each index, from a seeded shuffle. */
function foldsOf(count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  const next = random(FOLD_SEED);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const folds = new Array<number>(count);
  order.forEach((index, position) => (folds[index] = position % FOLDS));
  return folds;
}

function encode(vector: Float32Array): string {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).toString('base64');
}

function decode(text: string): Float32Array {
  // Copied into a fresh buffer: a pooled Buffer may start at an offset Float32Array cannot use.
  return new Float32Array(Uint8Array.from(Buffer.from(text, 'base64')).buffer);
}

const ratio = (part: number, whole: number): string => (whole === 0 ? '-' : (part / whole).toFixed(3));

const started = performance.now();
const { entries, tags } = await loadCatalog();
const tagger: Tagger = JSON.parse(await readFile(TAGGER_FILE, 'utf8'));
const prompts = subjectPrompts(tags, tagger.prompts);
const subjects = Object.keys(prompts);

// As with the palettes, only the hand-tagged own wallpapers may be the reference.
for (const entry of entries) {
  if (!existsSync(join('images', entry.file))) {
    throw new Error(`${entry.file} is not in images/: only hand-tagged own wallpapers may be used to evaluate the tagger`);
  }
}

let cache: EmbeddingCache = { model: CLIP_MODEL, items: {} };
try {
  const stored: EmbeddingCache = JSON.parse(await readFile(EMBEDDING_CACHE, 'utf8'));
  if (stored.model === CLIP_MODEL) cache = stored;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const clip = await loadClip();
const textEmbeddings = await clip.texts(subjects.map((slug) => prompts[slug]));
const texts = Object.fromEntries(subjects.map((slug, i) => [slug, textEmbeddings[i]]));

interface Item {
  tags: Set<string>;
  similarity: Record<string, number>;
  palettes: string[];
}

const items: Item[] = [];
const freshCache: EmbeddingCache = { model: CLIP_MODEL, items: {} };
let embedded = 0;
for (const entry of entries) {
  const slug = slugOf(entry);
  let preview: Buffer;
  try {
    preview = await readFile(join(PREVIEW_DIR, `${slug}.webp`));
  } catch (error) {
    throw new Error(`no preview for ${entry.file} (${PREVIEW_DIR}/${slug}.webp); run npm run build first (${(error as Error).message})`);
  }
  const hash = createHash('sha256').update(preview).digest('hex').slice(0, 16);
  const cached = cache.items[slug];
  let embedding: Float32Array;
  if (cached?.hash === hash) {
    embedding = decode(cached.embedding);
  } else {
    embedding = await clip.image(preview);
    embedded += 1;
  }
  freshCache.items[slug] = { hash, embedding: encode(embedding) };
  items.push({
    tags: new Set(entry.tags),
    similarity: similarities(embedding, texts),
    palettes: paletteTags(await sampleForPalette(preview), tagger.palettes ?? {}),
  });
}
await mkdir('.cache', { recursive: true });
await writeFile(EMBEDDING_CACHE, JSON.stringify(freshCache));

const scoresOf = (group: Item[], slug: string): number[] => group.map((item) => item.similarity[slug]);
const truthOf = (group: Item[], slug: string): boolean[] => group.map((item) => item.tags.has(slug));
const thresholdsFor = (group: Item[]): Record<string, number | null> =>
  Object.fromEntries(subjects.map((slug) => [slug, chooseThreshold(scoresOf(group, slug), truthOf(group, slug))]));

// Held-out assignments: every wallpaper is tagged once, by thresholds chosen without it.
const folds = foldsOf(items.length);
const heldOut: string[][] = new Array(items.length);
for (let fold = 0; fold < FOLDS; fold += 1) {
  const thresholds = thresholdsFor(items.filter((_, i) => folds[i] !== fold));
  items.forEach((item, i) => {
    if (folds[i] === fold) heldOut[i] = suggestTags(item.similarity, thresholds);
  });
}

// Rounded down to 4 places so that the stored value still accepts the wallpaper that set it.
const final = Object.fromEntries(
  Object.entries(thresholdsFor(items))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, threshold]) => [slug, threshold === null ? null : Math.floor(threshold * 10000) / 10000]),
);
const rows = ['tag            hand-tagged  threshold  assigned  correct  precision  recall'];
let assignedAll = 0;
let correctAll = 0;
let taggedAll = 0;
for (const slug of subjects) {
  const tagged = items.filter((item) => item.tags.has(slug)).length;
  const assigned = heldOut.filter((suggested) => suggested.includes(slug)).length;
  const correct = items.filter((item, i) => heldOut[i].includes(slug) && item.tags.has(slug)).length;
  assignedAll += assigned;
  correctAll += correct;
  taggedAll += tagged;
  rows.push(
    [
      slug.padEnd(14),
      String(tagged).padStart(11),
      (final[slug] === null ? 'null' : final[slug]!.toFixed(4)).padStart(10),
      String(assigned).padStart(9),
      String(correct).padStart(8),
      ratio(correct, assigned).padStart(10),
      ratio(correct, tagged).padStart(7),
    ].join(' '),
  );
}
const precision = assignedAll === 0 ? 0 : correctAll / assignedAll;
const twoOrMore = items.filter((item, i) => new Set([...heldOut[i], ...item.palettes]).size >= 2).length;
const withThreshold = subjects.filter((slug) => final[slug] !== null).length;
const overrides = Object.entries(tagger.prompts ?? {});

console.log(`${CLIP_MODEL} (q8), ${items.length} hand-tagged wallpapers, ${FOLDS}-fold cross-validation (seed ${FOLD_SEED}), precision >= ${MIN_PRECISION} per tag`);
console.log(`Prompts: "a <label> wallpaper"${overrides.length ? `, except ${overrides.map(([slug, text]) => `${slug}: "${text}"`).join(', ')}` : ''}`);
console.log('assigned, correct, precision and recall are held-out; threshold is the one written, chosen on all of them\n');
console.log(rows.join('\n'));
console.log(`\nHeld-out, all subject tags: precision ${ratio(correctAll, assignedAll)} (${correctAll} of ${assignedAll}), recall ${ratio(correctAll, taggedAll)} (${correctAll} of ${taggedAll})`);
console.log(`At least two tags (subject + palette, no folder hints): ${ratio(twoOrMore, items.length)} (${twoOrMore} of ${items.length})`);
console.log(`Thresholds written for ${withThreshold} of ${subjects.length} subject tags`);
console.log(`Embedded ${embedded} previews, ${items.length - embedded} from cache; ${((performance.now() - started) / 1000).toFixed(1)} s`);

// tagger.json is shared with the other taggers: only "subjects" is written here.
const merged = { ...tagger, subjects: final };
const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(TAGGER_FILE, JSON.stringify(sorted, null, 2) + '\n');
console.log(`\nWrote ${TAGGER_FILE}`);

if (precision < MIN_PRECISION) {
  console.error(`Held-out precision ${precision.toFixed(3)} is under ${MIN_PRECISION}: subject tags are not trustworthy enough to assign.`);
  process.exit(1);
}
