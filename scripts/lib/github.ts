import type { Source } from '../../src/lib/sources.ts';

export interface RemoteFile {
  path: string;
  sha: string;
  size: number;
}

/**
 * What a collection's file list turned out to be. "gone" means the collection
 * itself is not there any more and may be dropped; "transient" means we could not
 * find out, and its last approved contents must be kept.
 */
export type Listing =
  | { kind: 'ok'; files: RemoteFile[] }
  | { kind: 'gone'; status: number }
  | { kind: 'transient'; reason: string };

const API = 'https://api.github.com';
const TIMEOUT_MS = 20_000;
// 404 repo or branch missing, 410 and 451 taken down, 409 empty repository.
// A 403 or 401 is not here: it is rate limiting or a bad token, which says nothing about the collection.
const GONE = new Set([404, 410, 451, 409]);
const LFS_HEADER = new TextEncoder().encode('version https://git-lfs.github.com/spec/v1');

export async function listTree(
  source: Source,
  deps: { fetch?: typeof fetch; token?: string } = {},
): Promise<Listing> {
  const request = deps.fetch ?? fetch;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (deps.token) headers.Authorization = `Bearer ${deps.token}`;
  const url = `${API}/repos/${source.repo}/git/trees/${encodeURIComponent(source.branch)}?recursive=1`;

  let response: Response;
  try {
    response = await request(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    return { kind: 'transient', reason: `request failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (GONE.has(response.status)) return { kind: 'gone', status: response.status };
  if (response.status !== 200) {
    const limited = response.headers.get('x-ratelimit-remaining') === '0' ? ' (rate limited)' : '';
    return { kind: 'transient', reason: `GitHub answered ${response.status}${limited}` };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    return { kind: 'transient', reason: `unreadable answer: ${error instanceof Error ? error.message : String(error)}` };
  }
  const tree = (body as { tree?: unknown } | null)?.tree;
  if (!Array.isArray(tree)) return { kind: 'transient', reason: 'the answer has no file list' };
  // A cut-off list would look like deletions, so it counts as a failure.
  if ((body as { truncated?: unknown }).truncated === true) return { kind: 'transient', reason: 'the file list was truncated' };

  const files: RemoteFile[] = [];
  for (const item of tree as Record<string, unknown>[]) {
    if (item.type !== 'blob') continue;
    if (typeof item.path !== 'string' || typeof item.sha !== 'string') continue;
    files.push({ path: item.path, sha: item.sha, size: typeof item.size === 'number' ? item.size : 0 });
  }
  return { kind: 'ok', files };
}

/** Git LFS stores a small text pointer in place of the image; the real bytes are not in the repository. */
export function isLfsPointer(firstBytes: Uint8Array): boolean {
  return firstBytes.length >= LFS_HEADER.length && LFS_HEADER.every((byte, i) => firstBytes[i] === byte);
}
