import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Listing } from '../../scripts/lib/github.ts';
import { availableOriginals, fetchOriginal, indexedItem, loadApproved } from '../../scripts/lib/originals.ts';
import type { Source } from '../../src/lib/sources.ts';
import type { ApprovedFile } from '../../src/lib/types.ts';

const URL_ = 'https://raw.githubusercontent.com/o/r/main/a%20b.png';
const noWait = async (_ms: number) => {};

/** The shape of `fetch`, so a mock can stand in for it. */
type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function answers(...steps: (number | Error)[]) {
  let call = 0;
  return vi.fn<Fetch>(async () => {
    const step = steps[Math.min(call++, steps.length - 1)];
    if (step instanceof Error) throw step;
    return new Response(step === 200 ? new Uint8Array([1, 2, 3]) : 'nope', { status: step });
  });
}

const source: Source = {
  id: 'nordic-wallpapers', short: 'nordic', name: 'Nordic Wallpapers', repo: 'linuxdotexe/nordic-wallpapers',
  branch: 'master', include: [], exclude: [], tags: ['nord'], folders: {}, status: 'active',
};

function approvedFile(path: string, sha: string): ApprovedFile {
  return {
    path, sha, slug: path.replace(/\W+/g, '-'), title: path, tags: ['nord', 'minimal'], width: 1920, height: 1080,
    bytes: 6, animated: false, palette: [{ hex: '#336699', share: 1 }], phash: '0000000000000000',
  };
}

describe('fetchOriginal', () => {
  it('returns the bytes and bounds the request with a timeout', async () => {
    const fetch = answers(200);
    const bytes = await fetchOriginal(URL_, { fetch, sleep: noWait });
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(URL_);
    expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('tries again after a server error, twice at most', async () => {
    const recovering = answers(502, 503, 200);
    expect([...(await fetchOriginal(URL_, { fetch: recovering, sleep: noWait }))]).toEqual([1, 2, 3]);
    expect(recovering).toHaveBeenCalledTimes(3);

    const failing = answers(500);
    await expect(fetchOriginal(URL_, { fetch: failing, sleep: noWait })).rejects.toThrow(/500/);
    expect(failing).toHaveBeenCalledTimes(3);
  });

  it('tries again after a network error', async () => {
    const fetch = answers(new TypeError('fetch failed'), 200);
    expect([...(await fetchOriginal(URL_, { fetch, sleep: noWait }))]).toEqual([1, 2, 3]);
    expect(fetch).toHaveBeenCalledTimes(2);

    const down = answers(new TypeError('fetch failed'));
    await expect(fetchOriginal(URL_, { fetch: down, sleep: noWait })).rejects.toThrow(/fetch failed/);
    expect(down).toHaveBeenCalledTimes(3);
  });

  it('gives up at once when the file is not there', async () => {
    for (const status of [404, 403, 429]) {
      const fetch = answers(status);
      await expect(fetchOriginal(URL_, { fetch, sleep: noWait })).rejects.toThrow(String(status));
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });

  it('counts a request that runs past the timeout as a network error', async () => {
    const hanging = vi.fn<Fetch>(
      (_input, init) =>
        new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))),
    );
    await expect(fetchOriginal(URL_, { fetch: hanging, sleep: noWait, timeoutMs: 5 })).rejects.toThrow(/timeout/i);
    expect(hanging).toHaveBeenCalledTimes(3);
  });

  it('waits longer before each new try', async () => {
    const sleep = vi.fn(noWait);
    await fetchOriginal(URL_, { fetch: answers(500, 500, 200), sleep });
    const [first, second] = sleep.mock.calls.map(([ms]) => ms);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
  });
});

describe('indexedItem', () => {
  // `git hash-object` of "hello\n".
  const HELLO_SHA = 'ce013625030ba8dba906f756967f9e9ca394464a';
  const hello = () => vi.fn<Fetch>(async () => new Response('hello\n'));

  it('names the file by collection and path and fetches nothing until read', () => {
    const fetch = hello();
    const item = indexedItem(source, approvedFile('wallpapers/a b.png', HELLO_SHA), { fetch, sleep: noWait });
    expect(item).toMatchObject({ key: 'nordic-wallpapers:wallpapers/a b.png', slug: 'wallpapers-a-b-png', sha: HELLO_SHA });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reads the original from the collection's raw file", async () => {
    const fetch = hello();
    const item = indexedItem(source, approvedFile('wallpapers/a b.png', HELLO_SHA), { fetch, sleep: noWait });
    expect((await item.read()).toString()).toBe('hello\n');
    expect(fetch.mock.calls[0][0]).toBe(
      'https://raw.githubusercontent.com/linuxdotexe/nordic-wallpapers/master/wallpapers/a%20b.png',
    );
  });

  it('refuses bytes that are not the approved version', async () => {
    const item = indexedItem(source, approvedFile('wallpapers/a.png', '0'.repeat(40)), { fetch: hello(), sleep: noWait });
    await expect(item.read()).rejects.toThrow(/approved/);
  });
});

describe('loadApproved', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-approved-'));
    await writeFile(join(dir, 'listed.json'), JSON.stringify([approvedFile('a.png', 'a1')]));
    await writeFile(join(dir, 'object.json'), JSON.stringify({ path: 'a.png' }));
    await writeFile(join(dir, 'broken.json'), '[{');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads the approved files of a collection', async () => {
    expect(await loadApproved(dir, 'listed')).toEqual([approvedFile('a.png', 'a1')]);
  });

  it('has none for a collection without a file', async () => {
    expect(await loadApproved(dir, 'missing')).toEqual([]);
  });

  it('names the file when it is not a list', async () => {
    await expect(loadApproved(dir, 'object')).rejects.toThrow(/object\.json/);
    await expect(loadApproved(dir, 'broken')).rejects.toThrow(/broken\.json/);
  });
});

describe('availableOriginals', () => {
  const a1 = approvedFile('wallpapers/a.png', 'a1');
  const b1 = approvedFile('wallpapers/b.png', 'b1');
  const second: Source = { ...source, id: 'rose-pine', short: 'rose-pine', name: 'Rose Pine', repo: 'rose-pine/wallpapers' };

  function setup(approved: Record<string, ApprovedFile[]>, listings: Record<string, Listing>) {
    const warnings: string[] = [];
    const list = vi.fn(async (s: Source) => listings[s.id]);
    const deps = { approved: async (s: Source) => approved[s.id] ?? [], list, warn: (m: string) => warnings.push(m) };
    return { deps, list, warnings };
  }

  it('keeps the approved files that the listing still has with the same content', async () => {
    const { deps, warnings } = setup(
      { [source.id]: [a1, b1] },
      { [source.id]: { kind: 'ok', files: [{ path: a1.path, sha: 'a1', size: 6 }, { path: b1.path, sha: 'b2', size: 6 }] } },
    );
    expect(await availableOriginals([source], deps)).toEqual([{ source, file: a1 }]);
    expect(warnings).toEqual([]);
  });

  it('does not list a collection that has no approved files', async () => {
    const { deps, list } = setup({ [source.id]: [] }, {});
    expect(await availableOriginals([source, second], deps)).toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });

  it('lists only active collections', async () => {
    const files = { [source.id]: [a1], [second.id]: [b1] };
    const { deps, list } = setup(files, { [second.id]: { kind: 'ok', files: [{ path: b1.path, sha: 'b1', size: 6 }] } });
    const paused: Source = { ...source, status: 'paused' };
    const removed: Source = { ...second, id: 'gone-one', status: 'removed' };
    expect(await availableOriginals([paused, second, removed], deps)).toEqual([{ source: second, file: b1 }]);
    expect(list.mock.calls.map(([s]) => s.id)).toEqual([second.id]);
  });

  it('drops a collection that is gone and says which', async () => {
    const { deps, warnings } = setup({ [source.id]: [a1] }, { [source.id]: { kind: 'gone', status: 404 } });
    expect(await availableOriginals([source], deps)).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Nordic Wallpapers');
    expect(warnings[0]).toContain('404');
  });

  it('keeps the approved files of a collection that could not be listed, and says which', async () => {
    const { deps, warnings } = setup({ [source.id]: [a1, b1] }, { [source.id]: { kind: 'transient', reason: 'GitHub answered 502' } });
    expect(await availableOriginals([source], deps)).toEqual([{ source, file: a1 }, { source, file: b1 }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Nordic Wallpapers');
    expect(warnings[0]).toContain('GitHub answered 502');
  });

  it('keeps the order of the collections and of their files', async () => {
    const { deps } = setup(
      { [source.id]: [b1, a1], [second.id]: [a1] },
      { [source.id]: { kind: 'transient', reason: 'x' }, [second.id]: { kind: 'transient', reason: 'x' } },
    );
    const found = await availableOriginals([second, source], deps);
    expect(found.map(({ source: s, file }) => `${s.id}:${file.path}`)).toEqual([
      'rose-pine:wallpapers/a.png',
      'nordic-wallpapers:wallpapers/b.png',
      'nordic-wallpapers:wallpapers/a.png',
    ]);
  });
});
