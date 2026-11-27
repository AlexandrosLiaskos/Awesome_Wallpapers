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
/** The longest pause a rate-limited answer may ask for; a longer one is cut to this. */
const MAX_RETRY_AFTER_MS = 60_000;
/** The only host the token goes to: the collections' raw files. */
const RAW_HOST = 'raw.githubusercontent.com';
/** A build may leave out this many indexed files that could not be fetched... */
const MAX_LEFT_OUT = 10;
/** ...or this share of the indexed files, when that is more. */
const MAX_LEFT_OUT_SHARE = 0.02;

export interface FetchDeps {
  fetch?: typeof fetch;
  /** How a pause between tries is spent; tests skip it. */
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  /** GITHUB_TOKEN. Sent only to raw.githubusercontent.com, where it raises the rate limit. */
  token?: string;
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
 * The pause a rate-limited answer asks for, in milliseconds, at most a minute: from Retry-After
 * (seconds or a date), else from x-ratelimit-reset (when the limit resets, in Unix seconds).
 * Undefined when it asks for none.
 */
export function retryAfterMs(headers: Headers, now = Date.now()): number | undefined {
  const after = headers.get('retry-after')?.trim();
  const reset = headers.get('x-ratelimit-reset')?.trim();
  let ms = Number.NaN;
  if (after) ms = /^\d+$/.test(after) ? Number(after) * 1000 : Date.parse(after) - now;
  else if (reset && /^\d+$/.test(reset)) ms = Number(reset) * 1000 - now;
  return Number.isNaN(ms) ? undefined : Math.min(Math.max(ms, 0), MAX_RETRY_AFTER_MS);
}

/** Whether an answer means "slow down": 429, or a 403 from rate limiting rather than a refusal. */
function isThrottled(response: Response): boolean {
  if (response.status === 429) return true;
  return response.status === 403 && (response.headers.has('retry-after') || response.headers.get('x-ratelimit-remaining') === '0');
}

/**
 * Downloads a file. Each try has 60 seconds, the body included. A server error
 * (5xx), rate limiting (429, or 403 with Retry-After or no requests left), a
 * timeout or a network error is tried again, twice at most, after the pause a
 * rate-limited answer asks for (at most a minute); any other answer fails at
 * once, since asking again would get the same. The token, when given, is sent
 * only to raw.githubusercontent.com (fetch drops it on a redirect to another
 * host), and a 401 or 404 is asked once more without it.
 */
export async function fetchOriginal(url: string, deps: FetchDeps = {}): Promise<Buffer> {
  const request = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? pause;
  let headers = deps.token && new URL(url).hostname === RAW_HOST ? { authorization: `Bearer ${deps.token}` } : undefined;
  for (let attempt = 0; ; attempt++) {
    let status: number | undefined;
    let throttled = false;
    let wait: number | undefined;
    let reason: string;
    try {
      const signal = AbortSignal.timeout(deps.timeoutMs ?? TIMEOUT_MS);
      const response = await request(url, headers ? { signal, headers } : { signal });
      if (response.status === 200) return Buffer.from(await response.arrayBuffer());
      status = response.status;
      reason = `answered ${status}`;
      throttled = isThrottled(response);
      if (throttled) wait = retryAfterMs(response.headers);
      // The status is what counts; a body that cannot be cancelled changes nothing about it.
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      // A network error or the timeout, also while the body arrives.
      reason = reasonOf(error);
    }
    // raw.githubusercontent.com answers 404 to a token it does not take, so that is asked once more without it.
    if (headers && (status === 401 || status === 404)) {
      headers = undefined;
      attempt -= 1;
      continue;
    }
    if (status !== undefined && status < 500 && !throttled) throw new Error(`${url} ${reason}`);
    if (attempt === RETRIES) throw new Error(`${url} ${reason}, after ${RETRIES + 1} tries`);
    await sleep(wait ?? BACKOFF_MS * 2 ** attempt);
  }
}

/** How many indexed files a build may leave out because they could not be fetched: 10, or 2% of them when that is more. */
export function leftOutLimit(indexed: number): number {
  return Math.max(MAX_LEFT_OUT, Math.floor(indexed * MAX_LEFT_OUT_SHARE));
}

/**
 * Stops the build when more indexed files could not be fetched than a build may leave out (see
 * leftOutLimit): its deploy would replace the live site with a thinner one, as on a cold cache
 * while raw.githubusercontent.com throttles the runner. Names each collection with its count.
 */
export function checkLeftOut(leftOut: IndexedFile[], indexed: number): void {
  const limit = leftOutLimit(indexed);
  if (leftOut.length <= limit) return;
  const counts = new Map<string, number>();
  for (const { source } of leftOut) counts.set(source.name, (counts.get(source.name) ?? 0) + 1);
  const list = [...counts].map(([name, count]) => `${name}: ${count}`).join(', ');
  throw new Error(
    `${leftOut.length} of the ${indexed} files from the collections could not be fetched (${list}), more than the ${limit} a build may leave out. ` +
      'The build stops so that the live site stays as it is. The images made so far are kept, so the next build fetches only the rest.',
  );
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
  /** Also told about a collection that is gone, for the job summary. */
  gone?: (message: string) => void;
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
          const message = `${name} is gone, GitHub answered ${listing.status}: it is left out of this build`;
          deps.warn(message);
          deps.gone?.(message);
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
