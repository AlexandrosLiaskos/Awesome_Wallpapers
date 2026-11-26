// Measures how far machine subject tags can be trusted, against the hand-tagged wallpapers, and
// writes what the sync step needs to assign them. Run by hand after `npm run build` has made
// public/m/p:
//
//   npm run eval-tagger
//
// Two scorers are measured on CLIP image embeddings of the previews:
// - zero-shot, for reference: the cosine similarity with "a <label> wallpaper";
// - a probe per tag (src/lib/probe.ts), a logistic regression trained on the hand tags.
// Only the probe is gated and written.
//
// Everything is judged on wallpapers it was not fitted on. The own wallpapers are split into FOLDS
// folds and each fold is tagged by what was fitted on the others. For the probe that means: its
// threshold comes from chooseThreshold on out-of-fold scores within the training folds (an inner
// cross-validation in INNER_FOLDS folds), never on scores of wallpapers it was trained on, and the
// probe that scores the held-out fold is then trained on all the training folds.
//
// Afterwards the probes and thresholds are fitted the same way on all wallpapers and written:
// weights to data/tagger-weights.json, thresholds to data/tagger.json under "subjects", and the
// held-out result under "subjectsGate", which sync checks with subjectsUsable. Exits 1 when the
// held-out precision of everything the probes assigned is under MIN_PRECISION.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { slugOf } from '../src/lib/catalog.ts';
import { paletteTags, type PaletteSetting } from '../src/lib/palettes.ts';
import { probeScore, trainProbe, type Probe } from '../src/lib/probe.ts';
import { chooseThreshold, MIN_PRECISION, similarities, subjectPrompts, suggestTags, type SubjectsGate } from '../src/lib/suggest.ts';
import { CLIP_MODEL, loadClip } from './lib/clip.ts';
import { loadCatalog } from './lib/load.ts';
import { sampleForPalette } from './lib/palette-sample.ts';

const FOLDS = 5;
const FOLD_SEED = 9;
const INNER_FOLDS = 4;
const INNER_SEED = 17;
const PREVIEW_DIR = join('public', 'm', 'p');
const TAGGER_FILE = join('data', 'tagger.json');
const WEIGHTS_FILE = join('data', 'tagger-weights.json');
// Image embeddings take most of the time and do not depend on the prompts, so they are kept
// between runs, keyed by the preview's own bytes and by what made the embedding. Change CACHE_KEY
// after changing how clip.ts prepares an image.
const EMBEDDING_CACHE = join('.cache', 'clip-embeddings.json');
const CACHE_KEY = `${CLIP_MODEL}, unit length`;

interface Tagger {
  palettes?: Record<string, PaletteSetting>;
  prompts?: Record<string, string>;
  subjects?: Record<string, number | null>;
  subjectsGate?: SubjectsGate;
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

/** Fold number of each of count positions, from a seeded shuffle. */
function foldsOf(count: number, folds: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  const next = random(seed);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const result = new Array<number>(count);
  order.forEach((index, position) => (result[index] = position % folds));
  return result;
}

function encode(vector: Float32Array): string {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).toString('base64');
}

function decode(text: string): Float32Array {
  // Copied into a fresh buffer: a pooled Buffer may start at an offset Float32Array cannot use.
  return new Float32Array(Uint8Array.from(Buffer.from(text, 'base64')).buffer);
}

const ratio = (part: number, whole: number): string => (whole === 0 ? '-' : (part / whole).toFixed(3));
// Rounded down, so that a stored threshold still accepts the score that set it.
const floor4 = (value: number): number => Math.floor(value * 10000) / 10000;
const round4 = (value: number): number => Math.round(value * 10000) / 10000;

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

let cache: EmbeddingCache = { model: CACHE_KEY, items: {} };
try {
  const stored: EmbeddingCache = JSON.parse(await readFile(EMBEDDING_CACHE, 'utf8'));
  if (stored.model === CACHE_KEY) cache = stored;
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const clip = await loadClip();
const textEmbeddings = await clip.texts(subjects.map((slug) => prompts[slug]));
const texts = Object.fromEntries(subjects.map((slug, i) => [slug, textEmbeddings[i]]));

interface Item {
  tags: Set<string>;
  embedding: Float32Array;
  similarity: Record<string, number>;
  palettes: string[];
}

const items: Item[] = [];
const freshCache: EmbeddingCache = { model: CACHE_KEY, items: {} };
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
    embedding,
    similarity: similarities(embedding, texts),
    palettes: paletteTags(await sampleForPalette(preview), tagger.palettes ?? {}),
  });
}
await mkdir('.cache', { recursive: true });
await writeFile(EMBEDDING_CACHE, JSON.stringify(freshCache));

const everyone = items.map((_, i) => i);
const truthOf = (group: number[], slug: string): boolean[] => group.map((i) => items[i].tags.has(slug));

/** Each wallpaper of the group scored by a probe trained on the rest of the group, in INNER_FOLDS folds. */
function outOfFoldScores(group: number[], slug: string): number[] {
  const truth = truthOf(group, slug);
  const inner = foldsOf(group.length, INNER_FOLDS, INNER_SEED);
  const scores = new Array<number>(group.length);
  for (let fold = 0; fold < INNER_FOLDS; fold += 1) {
    const fit = group.flatMap((_, p) => (inner[p] === fold ? [] : [p]));
    const positives = fit.filter((p) => truth[p]).length;
    let probe: Probe | null = null;
    if (positives > 0 && positives < fit.length) {
      probe = trainProbe(fit.map((p) => items[group[p]].embedding), fit.map((p) => truth[p]));
    }
    group.forEach((index, p) => {
      // A fold whose training part has no tagged wallpaper cannot score: it never passes a threshold.
      if (inner[p] === fold) scores[p] = probe ? probeScore(probe, items[index].embedding) : -Infinity;
    });
  }
  return scores;
}

/** A tag's probe and threshold fitted on a group, or nulls when the threshold cannot reach the precision. */
function fitTag(group: number[], slug: string): { probe: Probe | null; threshold: number | null } {
  const truth = truthOf(group, slug);
  if (!truth.some(Boolean)) return { probe: null, threshold: null };
  const threshold = chooseThreshold(outOfFoldScores(group, slug), truth);
  if (threshold === null || !Number.isFinite(threshold)) return { probe: null, threshold: null };
  return { probe: trainProbe(group.map((i) => items[i].embedding), truth), threshold };
}

const folds = foldsOf(items.length, FOLDS, FOLD_SEED);
const heldOutZeroShot: string[][] = new Array(items.length);
const heldOutProbe: string[][] = new Array(items.length);
for (let fold = 0; fold < FOLDS; fold += 1) {
  const train = everyone.filter((i) => folds[i] !== fold);
  const test = everyone.filter((i) => folds[i] === fold);

  const zeroShot = Object.fromEntries(
    subjects.map((slug) => [slug, chooseThreshold(train.map((i) => items[i].similarity[slug]), truthOf(train, slug))]),
  );
  for (const i of test) heldOutZeroShot[i] = suggestTags(items[i].similarity, zeroShot);

  const fitted = Object.fromEntries(subjects.map((slug) => [slug, fitTag(train, slug)]));
  const thresholds = Object.fromEntries(subjects.map((slug) => [slug, fitted[slug].threshold]));
  for (const i of test) {
    const scores: Record<string, number> = {};
    for (const slug of subjects) {
      const probe = fitted[slug].probe;
      if (probe) scores[slug] = probeScore(probe, items[i].embedding);
    }
    heldOutProbe[i] = suggestTags(scores, thresholds);
  }
}

interface Tally {
  assigned: number;
  correct: number;
}

function tally(heldOut: string[][], slug: string): Tally {
  let assigned = 0;
  let correct = 0;
  heldOut.forEach((suggested, i) => {
    if (!suggested.includes(slug)) return;
    assigned += 1;
    if (items[i].tags.has(slug)) correct += 1;
  });
  return { assigned, correct };
}

const final = Object.fromEntries(subjects.map((slug) => [slug, fitTag(everyone, slug)]));
const rows = ['                           zero-shot  |  probe', 'tag            hand-tagged  precision  recall  |  threshold  assigned  correct  precision  recall'];
const totals = { zeroShot: { assigned: 0, correct: 0 }, probe: { assigned: 0, correct: 0 }, tagged: 0 };
for (const slug of subjects) {
  const tagged = items.filter((item) => item.tags.has(slug)).length;
  const zeroShot = tally(heldOutZeroShot, slug);
  const probe = tally(heldOutProbe, slug);
  const threshold = final[slug].threshold;
  totals.tagged += tagged;
  for (const [total, counts] of [[totals.zeroShot, zeroShot], [totals.probe, probe]] as const) {
    total.assigned += counts.assigned;
    total.correct += counts.correct;
  }
  rows.push(
    [
      slug.padEnd(14),
      String(tagged).padStart(11),
      ratio(zeroShot.correct, zeroShot.assigned).padStart(10),
      ratio(zeroShot.correct, tagged).padStart(7),
      ' |',
      (threshold === null ? 'null' : floor4(threshold).toFixed(4)).padStart(10),
      String(probe.assigned).padStart(9),
      String(probe.correct).padStart(8),
      ratio(probe.correct, probe.assigned).padStart(10),
      ratio(probe.correct, tagged).padStart(7),
    ].join(' '),
  );
}

const twoOrMore = (heldOut: string[][]): number => items.filter((item, i) => new Set([...heldOut[i], ...item.palettes]).size >= 2).length;
function summary(name: string, heldOut: string[][], total: Tally): string {
  const share = twoOrMore(heldOut);
  return (
    `${name}: precision ${ratio(total.correct, total.assigned)} (${total.correct} of ${total.assigned}), ` +
    `recall ${ratio(total.correct, totals.tagged)} (${total.correct} of ${totals.tagged}), ` +
    `at least two tags with palettes ${ratio(share, items.length)} (${share} of ${items.length})`
  );
}

const precision = totals.probe.assigned === 0 ? 0 : totals.probe.correct / totals.probe.assigned;
const recall = totals.probe.correct / totals.tagged;
const passed = precision >= MIN_PRECISION;
const withThreshold = subjects.filter((slug) => final[slug].threshold !== null);

console.log(
  `${CLIP_MODEL} (q8), ${items.length} hand-tagged wallpapers, ${FOLDS}-fold cross-validation (seed ${FOLD_SEED}), ` +
    `probe thresholds from ${INNER_FOLDS}-fold out-of-fold scores, precision >= ${MIN_PRECISION} per tag`,
);
console.log('Zero-shot prompts: "a <label> wallpaper"' + Object.entries(tagger.prompts ?? {}).map(([slug, text]) => `, ${slug}: "${text}"`).join(''));
console.log('All figures are held-out; the probe threshold is the one written, fitted on all wallpapers (no folder hints)\n');
console.log(rows.join('\n'));
console.log('\n' + summary('Zero-shot (reference)', heldOutZeroShot, totals.zeroShot));
console.log(summary('Probe (gated)', heldOutProbe, totals.probe));
console.log(`Probes and thresholds written for ${withThreshold.length} of ${subjects.length} subject tags`);
console.log(`Embedded ${embedded} previews, ${items.length - embedded} from cache; ${((performance.now() - started) / 1000).toFixed(1)} s`);

// tagger.json is shared with the other taggers: only "subjects" and "subjectsGate" are written here.
// Both files are written whatever the gate says; sync assigns subject tags only when it passed.
const subjectsGate: SubjectsGate = { precision: round4(precision), recall: round4(recall), passed };
const thresholds = Object.fromEntries(
  [...subjects].sort((a, b) => a.localeCompare(b)).map((slug) => [slug, final[slug].threshold === null ? null : floor4(final[slug].threshold!)]),
);
const merged = { ...tagger, subjects: thresholds, subjectsGate };
const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
await writeFile(TAGGER_FILE, JSON.stringify(sorted, null, 2) + '\n');

// One probe per line: 512 weights each would otherwise make a file of tens of thousands of lines.
const probeLines = [...withThreshold]
  .sort((a, b) => a.localeCompare(b))
  .map((slug) => {
    const probe = final[slug].probe!;
    return `    ${JSON.stringify(slug)}: ${JSON.stringify({ bias: round4(probe.bias), weights: probe.weights.map(round4) })}`;
  });
await writeFile(WEIGHTS_FILE, `{\n  "model": ${JSON.stringify(CACHE_KEY)},\n  "probes": {\n${probeLines.join(',\n')}\n  }\n}\n`);
console.log(`\nWrote ${TAGGER_FILE} and ${WEIGHTS_FILE}`);

if (!passed) {
  console.error(`Held-out precision ${precision.toFixed(3)} is under ${MIN_PRECISION}: subject tags are not trustworthy enough to assign.`);
  process.exit(1);
}
