// The originals of the indexed collections: which approved files a build shows,
// and how one is downloaded when its images must be made. They are never kept.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { availableFiles, rawFileUrl } from '../../src/lib/indexed.ts';
import type { Source } from '../../src/lib/sources.ts';
import type { ApprovedFile } from '../../src/lib/types.ts';
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
      await response.body?.cancel();
      status = response.status;
      reason = `answered ${status}`;
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
function blobSha(bytes: Buffer): string {
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

/** The approved files of a collection, from `<dir>/<id>.json`; none when there is no such file. */
export async function loadApproved(dir: string, id: string): Promise<ApprovedFile[]> {
  const path = join(dir, `${id}.json`);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return [];
    throw error;
  }
  let files: unknown;
  try {
    files = JSON.parse(text);
  } catch (error) {
    throw new Error(`${path} is not valid JSON: ${reasonOf(error)}`);
  }
  if (!Array.isArray(files)) throw new Error(`${path} must hold a list of approved files`);
  return files as ApprovedFile[];
}

export interface OriginalsDeps {
  approved: (source: Source) => Promise<ApprovedFile[]>;
  list: (source: Source) => Promise<Listing>;
  warn: (message: string) => void;
}

/**
 * The approved files that each active collection still has, collection by
 * collection. One without approved files is not asked at all, so a build needs
 * no network until a collection is approved. One that is gone shows nothing;
 * one that could not be listed keeps its approved files (see `availableFiles`).
 */
export async function availableOriginals(sources: Source[], deps: OriginalsDeps): Promise<IndexedFile[]> {
  const found = await Promise.all(
    sources
      .filter((source) => source.status === 'active')
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
        return availableFiles(approved, listing).map((file) => ({ source, file }));
      }),
  );
  return found.flat();
}
