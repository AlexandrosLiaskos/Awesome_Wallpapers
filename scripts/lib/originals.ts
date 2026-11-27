// The originals of the indexed collections: which approved files a build shows,
// and how one is downloaded when its images must be made. They are never kept.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { availableFiles, rawFileUrl } from '../../src/lib/indexed.ts';
import type { Source } from '../../src/lib/sources.ts';
import type { ApprovedFile, SkippedFile } from '../../src/lib/types.ts';
import type { Listing } from './github.ts';
import type { MediaItem } from './media.ts';

const TIMEOUT_MS = 60_000;
const RETRIES = 2;
/** The pause before the first new try; it doubles for each one after. */
const BACKOFF_MS = 2_000;

export interface FetchDeps {
  fetch?: typeof fetch;
  /** How a pause between tries is spent; tests skip it. */
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

/** An approved file of a collection. */
export interface IndexedFile {
  source: Source;
  file: ApprovedFile;
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function reasonOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  // fetch reports every network failure as "fetch failed"; the cause says which.
  return error.cause instanceof Error ? `${error.message} (${error.cause.message})` : error.message;
}

/**
 * Downloads a file. Each try has 60 seconds, the body included. A server error
 * (5xx), a timeout or a network error is tried again, twice at most; any other
 * answer fails at once, since asking again would get the same.
 */
export async function fetchOriginal(url: string, deps: FetchDeps = {}): Promise<Buffer> {
  const request = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? pause;
  for (let attempt = 0; ; attempt++) {
    let status: number | undefined;
    let reason: string;
    try {
      const response = await request(url, { signal: AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS) });
      if (response.status === 200) return Buffer.from(await response.arrayBuffer());
      status = response.status;
      reason = `answered ${status}`;
      // The status is what counts; a body that cannot be cancelled changes nothing about it.
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      // A network error or the timeout, also while the body arrives.
      reason = reasonOf(error);
    }
    if (status !== undefined && status < 500) throw new Error(`${url} ${reason}`);
    if (attempt === RETRIES) throw new Error(`${url} ${reason}, after ${RETRIES + 1} tries`);
    await sleep(BACKOFF_MS * 2 ** attempt);
  }
}

/** The Git blob SHA of some bytes, as a tree listing gives it. */
export function blobSha(bytes: Buffer): string {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/**
 * An approved file as an item of the media step. Its original is downloaded only
 * when its images must be made, and must be the approved version: the cache keeps
 * what was made from it under the approved SHA.
 */
export function indexedItem(source: Source, file: ApprovedFile, deps: FetchDeps = {}): MediaItem {
  const url = rawFileUrl(source, file.path);
  return {
    key: `${source.id}:${file.path}`,
    slug: file.slug,
    sha: file.sha,
    read: async () => {
      const bytes = await fetchOriginal(url, deps);
      if (blobSha(bytes) !== file.sha) throw new Error(`${url} is no longer the approved version`);
      return bytes;
    },
  };
}

/**
 * What `data/sources/<id>.json` keeps about a collection: the approved files, and the files sync
 * skipped, so that it does not download them again until they change.
 */
export interface CollectionRecord {
  approved: ApprovedFile[];
  skipped: SkippedFile[];
}

/** A collection's record from `<dir>/<id>.json`; empty when there is no such file. */
export async function loadCollection(dir: string, id: string): Promise<CollectionRecord> {
  const path = join(dir, `${id}.json`);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return { approved: [], skipped: [] };
    throw error;
  }
  let record: unknown;
  try {
    record = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${reasonOf(error)}`);
  }
  const fields = typeof record === 'object' && record !== null && !Array.isArray(record) ? (record as Record<string, unknown>) : {};
  const { approved, skipped = [] } = fields;
  if (!Array.isArray(approved) || !Array.isArray(skipped)) {
    throw new Error(`${path} must hold { "approved": [...], "skipped": [...] }`);
  }
  return { approved: approved as ApprovedFile[], skipped: skipped as SkippedFile[] };
}

/** The approved files of a collection (see loadCollection). */
export async function loadApproved(dir: string, id: string): Promise<ApprovedFile[]> {
  return (await loadCollection(dir, id)).approved;
}

export interface OriginalsDeps {
  approved: (source: Source) => Promise<ApprovedFile[]>;
  list: (source: Source) => Promise<Listing>;
  warn: (message: string) => void;
}

/**
 * The approved files that each collection still has, collection by collection.
 * A paused collection is listed like an active one, so its removals still apply;
 * a removed one shows nothing and is not asked. One without approved files is
 * not asked either, so a build needs no network until a collection is approved.
 * One that is gone shows nothing; one that could not be listed keeps its
 * approved files (see `availableFiles`). A file still held for hand tagging is
 * left out with a warning: validation keeps it from being merged, and a
 * scheduled build must not stop over it.
 */
export async function availableOriginals(sources: Source[], deps: OriginalsDeps): Promise<IndexedFile[]> {
  const found = await Promise.all(
    sources
      .filter((source) => source.status !== 'removed')
      .map(async (source) => {
        const approved = await deps.approved(source);
        if (approved.length === 0) return [];
        const listing = await deps.list(source);
        const name = `${source.name} (${source.repo})`;
        if (listing.kind === 'gone') {
          deps.warn(`${name} is gone, GitHub answered ${listing.status}: it is left out of this build`);
        } else if (listing.kind === 'transient') {
          deps.warn(`${name} could not be listed (${listing.reason}): its approved files are kept`);
        }
        return availableFiles(approved, listing).flatMap((file) => {
          if (!file.held) return [{ source, file }];
          deps.warn(`${source.name}: ${file.path} is held for hand tagging: it is left out of this build`);
          return [];
        });
      }),
  );
  return found.flat();
}

/**
 * The indexed files whose slug no own wallpaper and no earlier indexed file has. Two items with one
 * slug would overwrite each other's pages and images; validation catches a clash before a merge,
 * and a scheduled build leaves the later file out with a warning instead of stopping.
 */
export function withoutSlugClashes(ownSlugs: Iterable<string>, indexed: IndexedFile[], warn: (message: string) => void): IndexedFile[] {
  const users = new Map<string, string>([...ownSlugs].map((slug) => [slug, 'an own wallpaper']));
  return indexed.filter(({ source, file }) => {
    const user = users.get(file.slug);
    if (user !== undefined) {
      warn(`${source.name}: ${file.path} is left out of this build, its address "${file.slug}" is already used by ${user}`);
      return false;
    }
    users.set(file.slug, `${source.name}: ${file.path}`);
    return true;
  });
}
