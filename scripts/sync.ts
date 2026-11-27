// Finds the new, changed and removed files of the indexed collections and prepares the additions
// for review. A daily workflow runs it and opens one pull request with what it wrote; additions go
// live only when the owner merges that pull request, while removals already apply at build time
// (see availableOriginals).
//
//   node scripts/sync.ts                  every collection in data/sources.yml
//   node scripts/sync.ts --source <id>    one collection, by id or short name
//
// Writes data/sources/<id>.json (the approved files, sorted by path, with "held": true on files
// that need hand tagging, and the skipped files, which are not downloaded again until they
// change), contact sheets of the files to review to .cache/review/<id>-NN.jpg, and
// .cache/review/summary.md, the pull request's body. GITHUB_TOKEN, when set, is used to list the
// collections and to download their files.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { MIN_LONG_EDGE, MIN_TAGS, slugOf } from '../src/lib/catalog.ts';
import { combineTags, diffListing, indexedSlug, rawFileUrl, screenFiles, SKIP, titleOf } from '../src/lib/indexed.ts';
import { paletteTags, type PaletteSetting } from '../src/lib/palettes.ts';
import { probeScore, type Probe } from '../src/lib/probe.ts';
import { folderTags, inFolders, parseSources, type Source } from '../src/lib/sources.ts';
import { applicableSubjects, suggestTags, type HeldOut, type SubjectsGate } from '../src/lib/suggest.ts';
import type { ApprovedFile, SkippedFile, Tag } from '../src/lib/types.ts';
import { isLfsPointer, listTree, type Listing, type RemoteFile } from './lib/github.ts';
import { loadCatalog } from './lib/load.ts';
import { measureOriginal, type Derived } from './lib/media.ts';
import { blobSha, fetchOriginal, loadCollection, type CollectionRecord } from './lib/originals.ts';
import { sampleForPalette } from './lib/palette-sample.ts';
import { mapLimit } from './lib/scan.ts';
import { contactSheet, PER_SHEET, type SheetCell } from './lib/sheet.ts';

/** Originals downloaded, measured and tagged at a time. */
const DOWNLOADS = 4;
/** Enough of the start of a file to recognise a Git LFS pointer. */
const LFS_PROBE = 64;
/**
 * Reasons that say nothing about the file itself: the file is tried again next time, and a changed
 * one keeps its approved version meanwhile. Every other skip is remembered until the file changes.
 */
const PASSING = new Set<string>([SKIP.download, SKIP.moved]);

export interface SyncDeps {
  listTree: (source: Source) => Promise<Listing>;
  fetchOriginal: (url: string) => Promise<Buffer>;
  /** What the media step measures from an original, and its preview (see measureOriginal). */
  measure: (bytes: Buffer) => Promise<{ derived: Derived; preview: Buffer }>;
  /**
   * What the image says, from its preview: palette tags, then subject tags, both trusted enough to
   * apply; and hints, subject tags the machine suggests but may not apply, for the reviewer.
   */
  tag: (preview: Buffer) => Promise<{ tags: string[]; hints: string[] }>;
  /** Every slug in use, own and of every collection; the slugs given to new files are added to it. */
  taken: Set<string>;
  /** The tags of tags.yml, for titles made from tags. */
  vocabulary: Tag[];
}

export interface ReviewItem {
  file: ApprovedFile;
  status: 'added' | 'held' | 'changed';
  preview: Buffer;
  hints: string[];
}

export interface SyncResult {
  /** The collection's approved files after the sync, sorted by path. */
  approved: ApprovedFile[];
  /** New files proposed with two to five tags. */
  added: ApprovedFile[];
  /** New or changed files left with fewer than two tags, marked held for hand tagging. */
  held: ApprovedFile[];
  /** Changed files proposed again, measured anew. */
  changed: ApprovedFile[];
  /** Approved files the collection no longer has in a usable form. */
  removed: ApprovedFile[];
  /** Files skipped this time; those remembered from earlier runs are not looked at again. */
  skipped: SkippedFile[];
  /** The skipped files to remember, sorted by path: every skip that is about the file, while it is listed unchanged. */
  skipList: SkippedFile[];
  /** Changed files whose tags differ from what the machine gives now: their tags and title were kept. */
  kept: { path: string; tags: string[]; machine: string[] }[];
  /** The added, held and changed files with their previews, in path order, as the contact sheets number them. */
  review: ReviewItem[];
  /** Why the collection was left as it was, when it was. */
  notSynced?: string;
}

type Examined =
  | { reason: string; detail?: string }
  | { derived: Derived; preview: Buffer; tags: string[]; hints: string[] };

const byPath = (a: { path: string }, b: { path: string }) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((tag) => b.includes(tag));

/** Downloads, checks, measures and tags one file. */
async function examine(source: Source, remote: RemoteFile, deps: SyncDeps): Promise<Examined> {
  let bytes: Buffer;
  try {
    bytes = await deps.fetchOriginal(rawFileUrl(source, remote.path));
  } catch (error) {
    return { reason: SKIP.download, detail: messageOf(error) };
  }
  if (isLfsPointer(bytes.subarray(0, LFS_PROBE))) return { reason: SKIP.lfs };
  // What is measured is approved under the listed SHA, and builds check every download against it.
  if (blobSha(bytes) !== remote.sha) return { reason: SKIP.moved };
  let measured: { derived: Derived; preview: Buffer };
  try {
    measured = await deps.measure(bytes);
  } catch (error) {
    return { reason: SKIP.unreadable, detail: messageOf(error) };
  }
  const { derived, preview } = measured;
  if (Math.max(derived.width, derived.height) < MIN_LONG_EDGE) {
    return { reason: SKIP.tooSmall, detail: `${derived.width}x${derived.height}` };
  }
  const image = await deps.tag(preview);
  const tags = combineTags(folderTags(remote.path, source), image.tags);
  return { derived, preview, tags, hints: image.hints.filter((hint) => !tags.includes(hint)) };
}

/** An approved entry in the order of its keys in data/sources/<id>.json; held when it has too few tags. */
function entryOf(remote: RemoteFile, derived: Derived, given: Pick<ApprovedFile, 'slug' | 'title' | 'tags' | 'featured'>): ApprovedFile {
  const held = new Set(given.tags).size < MIN_TAGS;
  return {
    path: remote.path,
    sha: remote.sha,
    slug: given.slug,
    title: given.title,
    tags: given.tags,
    ...(held ? { held: true } : {}),
    ...(given.featured ? { featured: true } : {}),
    width: derived.width,
    height: derived.height,
    bytes: derived.bytes,
    animated: derived.animated,
    palette: derived.palette,
    phash: derived.phash,
  };
}

/**
 * Brings one collection's approved files up to date with its listing. Removed files leave the list.
 * New files are downloaded, measured, tagged, titled and given a free slug; a changed file is
 * measured and tagged again but keeps its slug, title and featured mark, and keeps its tags too
 * when they differ from the machine's, which marks them as hand-edited. Files left with fewer than
 * two tags are held. A file in `skipList` is not downloaded again while it is listed with the same
 * SHA. A paused collection takes no new files; a removed one is not listed; one whose listing is
 * gone or failed is left as it was.
 */
export async function syncSource(source: Source, approved: ApprovedFile[], deps: SyncDeps, skipList: SkippedFile[] = []): Promise<SyncResult> {
  const result: SyncResult = { approved, added: [], held: [], changed: [], removed: [], skipped: [], skipList, kept: [], review: [] };
  if (source.status === 'removed') return { ...result, notSynced: 'removed in data/sources.yml, so it was not checked' };
  const listing = await deps.listTree(source);
  if (listing.kind === 'gone') return { ...result, notSynced: `gone (GitHub answered ${listing.status}), so builds leave it out` };
  if (listing.kind === 'transient') return { ...result, notSynced: `could not be listed (${listing.reason}), so its approved files are kept` };

  // A file skipped before stays skipped, unexamined, while it is listed unchanged in the folders.
  const listed = new Map(listing.files.map((file) => [file.path, file.sha]));
  const skips = new Map(
    skipList.filter((file) => listed.get(file.path) === file.sha && inFolders(file.path, source)).map((file) => [file.path, file]),
  );
  const isKnown = (file: RemoteFile | SkippedFile) => skips.get(file.path)?.sha === file.sha;
  const skip = (file: SkippedFile) => {
    result.skipped.push(file);
    if (!PASSING.has(file.reason)) skips.set(file.path, file);
  };

  const { wanted, skipped } = screenFiles(listing.files, source);
  skipped.filter((file) => !isKnown(file)).forEach(skip);
  const diff = diffListing(approved, wanted);
  const previous = new Map(approved.map((file) => [file.path, file]));
  const fresh = source.status === 'paused' ? [] : diff.added.filter((file) => !isKnown(file));
  const queue = [...fresh, ...diff.changed].sort(byPath);
  const examined = await mapLimit(queue, DOWNLOADS, (remote) => examine(source, remote, deps));

  const removed = new Set(diff.removed.map((file) => file.path));
  const files = new Map(approved.filter((file) => !removed.has(file.path)).map((file) => [file.path, file]));
  const titles = new Set([...files.values()].map((file) => file.title));
  result.removed.push(...diff.removed);

  // In path order, so slugs and numbered titles do not depend on which download finished first.
  queue.forEach((remote, i) => {
    const outcome = examined[i];
    const before = previous.get(remote.path);
    if ('reason' in outcome) {
      skip({ path: remote.path, sha: remote.sha, reason: outcome.reason, ...(outcome.detail ? { detail: outcome.detail } : {}) });
      if (before && !PASSING.has(outcome.reason)) {
        files.delete(remote.path);
        result.removed.push(before);
      }
      return;
    }

    let file: ApprovedFile;
    if (before) {
      const handTagged = !sameTags(before.tags, outcome.tags);
      if (handTagged) result.kept.push({ path: remote.path, tags: before.tags, machine: outcome.tags });
      file = entryOf(remote, outcome.derived, { ...before, tags: handTagged ? before.tags : outcome.tags });
    } else {
      const slug = indexedSlug(source, remote.path, deps.taken);
      deps.taken.add(slug);
      const title = titleOf(remote.path, outcome.tags, deps.vocabulary, titles);
      titles.add(title);
      file = entryOf(remote, outcome.derived, { slug, title, tags: outcome.tags });
    }
    files.set(remote.path, file);
    const status = file.held ? 'held' : before ? 'changed' : 'added';
    result[status].push(file);
    result.review.push({ file, status, preview: outcome.preview, hints: outcome.hints });
  });

  result.approved = [...files.values()].sort(byPath);
  result.skipList = [...skips.values()].sort(byPath);
  return result;
}

/**
 * A collection's record as written to data/sources/<id>.json: an approved file with one key per
 * line, so a hand edit of its tags is a one-line change, and a skipped file on one line.
 */
export function formatCollection({ approved, skipped }: CollectionRecord): string {
  const list = (items: string[]) => (items.length === 0 ? '[]' : `[\n${items.join(',\n')}\n  ]`);
  const entries = approved.map(
    (file) => `    {\n${Object.entries(file).map(([key, value]) => `      ${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(',\n')}\n    }`,
  );
  return `{\n  "approved": ${list(entries)},\n  "skipped": ${list(skipped.map((file) => `    ${JSON.stringify(file)}`))}\n}\n`;
}

/** Stops when data/tagger-weights.json was fitted on another model than the one loaded: its probes would score nonsense. */
export function checkModel(written: unknown, expected: Record<string, string>): void {
  const same =
    typeof written === 'object' &&
    written !== null &&
    Object.keys(written).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => (written as Record<string, unknown>)[key] === value);
  if (same) return;
  throw new Error(
    `data/tagger-weights.json was fitted on ${JSON.stringify(written)}, but scripts/lib/clip.ts loads ${JSON.stringify(expected)}. ` +
      'Run npm run eval-tagger to fit the probes on that model.',
  );
}

export interface Report {
  source: Source;
  result: SyncResult;
  /** File names of the collection's contact sheets. */
  sheets: string[];
}

function counted(skipped: SkippedFile[]): string {
  const counts = new Map<string, number>();
  for (const { reason } of skipped) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => `${reason}: ${count}`).join(', ');
}

const cell = (text: string) => text.replace(/\|/g, '\\|');
const listOf = (tags: string[]) => tags.join(', ') || 'none';

/** The review pull request's body: what happened in each collection, then the files to tag by hand. */
export function summaryOf(reports: Report[]): string {
  const lines = [
    '# Collection sync',
    '',
    'New and changed files go live when this pull request is merged. Files that left a collection are already left out of the site.',
  ];
  const held: string[] = [];
  for (const { source, result, sheets } of reports) {
    lines.push('', `## ${source.name}`, '', `[${source.repo}](https://github.com/${source.repo}), branch ${source.branch}`, '');
    if (result.notSynced) {
      lines.push(`Not synced: ${result.notSynced}.`);
      continue;
    }
    if (source.status === 'paused') lines.push('Paused: new files are not proposed.', '');
    lines.push(
      `- Added: ${result.added.length}`,
      `- Held for hand tagging: ${result.held.length}${result.held.length > 0 ? ' (fewer than two tags after tagging)' : ''}`,
      `- Changed: ${result.changed.length}`,
      `- Removed: ${result.removed.length}`,
      `- Skipped this time: ${result.skipped.length}${result.skipped.length > 0 ? ` (${counted(result.skipped)})` : ''}`,
    );
    if (result.skipList.length > 0) {
      lines.push(`- Skipped and remembered: ${result.skipList.length}, not downloaded again until they change`);
    }
    if (sheets.length > 0) lines.push(`- Contact sheets: ${sheets.join(', ')}`);
    if (result.kept.length > 0) {
      lines.push('', 'Changed files that kept their tags and title, since these differ from what the machine gives:', '');
      for (const { path, tags, machine } of result.kept) lines.push(`- \`${path}\`: kept ${listOf(tags)}; the machine gives ${listOf(machine)}`);
    }
    result.review.forEach(({ file, hints }, i) => {
      if (!file.held) return;
      const sheet = String(Math.floor(i / PER_SHEET) + 1).padStart(2, '0');
      held.push(`| ${cell(source.name)} | ${sheet}, #${i + 1} | \`${cell(file.path)}\` | ${listOf(file.tags)} | ${listOf(hints)} |`);
    });
  }
  if (held.length > 0) {
    lines.push(
      '',
      '## Held files',
      '',
      'Each needs two to five tags in its data/sources/<id>.json, and its `"held": true` removed; validation fails until then. Hints are subject tags the machine suggests but does not trust enough to apply.',
      '',
      '| Collection | Sheet | File | Tags | Hints |',
      '| --- | --- | --- | --- | --- |',
      ...held,
    );
  }
  return `${lines.join('\n')}\n`;
}

// What sync reads from data/tagger.json and data/tagger-weights.json.
interface TaggerFile {
  palettes?: Record<string, PaletteSetting>;
  subjects?: Record<string, number | null>;
  subjectsGate?: SubjectsGate;
  subjectsHeldOut?: Record<string, HeldOut>;
}

interface WeightsFile {
  model: unknown;
  probes: Record<string, Probe>;
}

type Embedder = () => Promise<{ image(buffer: Buffer): Promise<Float32Array> }>;

/** The image taggers on a preview, as calibrated: palettes measured, subjects from the probes. */
function imageTagger(tagger: TaggerFile, probes: Record<string, Probe>, loadClip: Embedder): SyncDeps['tag'] {
  const applicable = applicableSubjects(tagger);
  let clip: ReturnType<Embedder> | undefined;
  return async (preview) => {
    const palettes = paletteTags(await sampleForPalette(preview), tagger.palettes ?? {});
    // Loaded on first use, so a run without new files needs no model.
    clip ??= loadClip();
    const embedding = await (await clip).image(preview);
    const scores = Object.fromEntries(Object.entries(probes).map(([slug, probe]) => [slug, probeScore(probe, embedding)]));
    const subjects = suggestTags(scores, applicable);
    const hints = suggestTags(scores, tagger.subjects ?? {}).filter((slug) => !subjects.includes(slug));
    return { tags: [...palettes, ...subjects], hints };
  };
}

const APPROVED_DIR = join('data', 'sources');
const REVIEW_DIR = join('.cache', 'review');

/** Writes a collection's record when it changed; a collection that never had files gets no file. */
async function writeCollection(id: string, record: CollectionRecord): Promise<void> {
  const path = join(APPROVED_DIR, `${id}.json`);
  const text = formatCollection(record);
  const before = await readFile(path, 'utf8').catch(() => undefined);
  if (before === text || (before === undefined && record.approved.length === 0 && record.skipped.length === 0)) return;
  await writeFile(path, text);
}

function cellOf({ file, status, preview, hints }: ReviewItem): SheetCell {
  const note = [status === 'added' ? '' : status, hints.length > 0 ? `hints: ${hints.join(', ')}` : ''].filter(Boolean).join(', ');
  return { image: preview, title: file.title, tags: file.tags, ...(note ? { note } : {}) };
}

async function main(): Promise<void> {
  const started = Date.now();
  const args = process.argv.slice(2);
  const flag = args.indexOf('--source');
  const only = flag === -1 ? undefined : args[flag + 1];
  if (flag !== -1 && !only) throw new Error('--source needs the id or short name of a collection');

  // Imported here: loading the model library takes a moment and tests of this file never need it.
  const { CLIP, loadClip } = await import('./lib/clip.ts');
  const [{ entries, tags }, sourcesYaml, taggerText, weightsText] = await Promise.all([
    loadCatalog(),
    readFile('data/sources.yml', 'utf8'),
    readFile('data/tagger.json', 'utf8'),
    readFile('data/tagger-weights.json', 'utf8'),
  ]);
  const weights = JSON.parse(weightsText) as WeightsFile;
  checkModel(weights.model, CLIP);
  const sources = parseSources(sourcesYaml, tags.map((tag) => tag.slug));
  const chosen = only === undefined ? sources : sources.filter((source) => source.id === only || source.short === only);
  if (chosen.length === 0) throw new Error(`there is no collection "${only}" in data/sources.yml`);

  const records = new Map(await Promise.all(sources.map(async (source) => [source.id, await loadCollection(APPROVED_DIR, source.id)] as const)));
  const token = process.env.GITHUB_TOKEN || undefined;
  const deps: SyncDeps = {
    listTree: (source) => listTree(source, { token }),
    fetchOriginal: (url) => fetchOriginal(url, { token }),
    measure: measureOriginal,
    tag: imageTagger(JSON.parse(taggerText) as TaggerFile, weights.probes, loadClip),
    taken: new Set([...entries.map(slugOf), ...[...records.values()].flatMap((record) => record.approved.map((file) => file.slug))]),
    vocabulary: tags,
  };

  // Sheets of an earlier run would end up in the pull request as if they were this one's.
  await rm(REVIEW_DIR, { recursive: true, force: true });
  await mkdir(REVIEW_DIR, { recursive: true });
  const reports: Report[] = [];
  for (const source of chosen) {
    const { approved, skipped } = records.get(source.id)!;
    const result = await syncSource(source, approved, deps, skipped);
    if (!result.notSynced) await writeCollection(source.id, { approved: result.approved, skipped: result.skipList });
    const sheets = await contactSheet(result.review.map(cellOf), join(REVIEW_DIR, source.id));
    reports.push({ source, result, sheets: sheets.map((path) => basename(path)) });
    if (result.notSynced) {
      console.warn(`${source.name}: not synced, ${result.notSynced}`);
    } else {
      const { added, held, changed, removed, skipped } = result;
      console.log(
        `${source.name}: ${added.length} added, ${held.length} held, ${changed.length} changed, ${removed.length} removed, ${skipped.length} skipped`,
      );
    }
    for (const { path, reason, detail } of result.skipped) {
      if (reason === SKIP.download || reason === SKIP.unreadable) console.warn(`  ${path}: ${reason} (${detail})`);
    }
  }
  await writeFile(join(REVIEW_DIR, 'summary.md'), summaryOf(reports));
  console.log(`sync: ${chosen.length} collection(s) in ${((Date.now() - started) / 1000).toFixed(1)}s; review files in ${REVIEW_DIR}`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
