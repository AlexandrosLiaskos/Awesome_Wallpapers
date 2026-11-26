import { describe, expect, it, vi } from 'vitest';
import { isLfsPointer, listTree } from '../../scripts/lib/github.ts';
import type { Source } from '../../src/lib/sources.ts';

const source: Source = {
  id: 'nordic', short: 'nordic', name: 'Nordic', repo: 'linuxdotexe/nordic-wallpapers', branch: 'master',
  include: [], exclude: [], tags: ['nord'], folders: {}, status: 'active',
};

function reply(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));
}

function callOf(fetch: ReturnType<typeof reply>): [string, RequestInit] {
  return fetch.mock.calls[0] as unknown as [string, RequestInit];
}

describe('listTree', () => {
  it('returns blobs only', async () => {
    const fetch = reply(200, {
      truncated: false,
      tree: [
        { path: 'wallpapers', type: 'tree', sha: 't' },
        { path: 'wallpapers/a b.png', type: 'blob', sha: 'abc', size: 12 },
        { path: 'lib', type: 'commit', sha: 'c' },
      ],
    });
    expect(await listTree(source, { fetch })).toEqual({
      kind: 'ok',
      files: [{ path: 'wallpapers/a b.png', sha: 'abc', size: 12 }],
    });
  });

  it.each([404, 410, 451, 409])('%i is gone', async (status) => {
    expect(await listTree(source, { fetch: reply(status) })).toEqual({ kind: 'gone', status });
  });

  it.each([500, 502, 401, 400])('%i is transient', async (status) => {
    expect((await listTree(source, { fetch: reply(status) })).kind).toBe('transient');
  });

  it('treats a rejected fetch as transient', async () => {
    const fetch = vi.fn(async () => {
      throw new Error('boom');
    });
    expect(await listTree(source, { fetch })).toEqual({ kind: 'transient', reason: expect.stringContaining('boom') });
  });

  it('treats rate limiting as transient', async () => {
    const limited = await listTree(source, { fetch: reply(403, {}, { 'x-ratelimit-remaining': '0' }) });
    expect(limited.kind).toBe('transient');
    expect((await listTree(source, { fetch: reply(429) })).kind).toBe('transient');
    expect((await listTree(source, { fetch: reply(403) })).kind).toBe('transient');
  });

  it('treats a truncated listing as transient', async () => {
    expect((await listTree(source, { fetch: reply(200, { truncated: true, tree: [] }) })).kind).toBe('transient');
  });

  it('treats a malformed body as transient', async () => {
    expect((await listTree(source, { fetch: reply(200, { nope: 1 }) })).kind).toBe('transient');
  });

  it('calls the tree endpoint and sends the token only when given', async () => {
    const fetch = reply(200, { truncated: false, tree: [] });
    await listTree(source, { fetch, token: 'secret' });
    const [url, init] = callOf(fetch);
    expect(url).toBe('https://api.github.com/repos/linuxdotexe/nordic-wallpapers/git/trees/master?recursive=1');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret');
    expect(headers.Accept).toBe('application/vnd.github+json');
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const anon = reply(200, { truncated: false, tree: [] });
    await listTree(source, { fetch: anon });
    expect((callOf(anon)[1].headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('encodes a branch with slashes', async () => {
    const fetch = reply(200, { truncated: false, tree: [] });
    await listTree({ ...source, branch: 'feat/x y' }, { fetch });
    expect(callOf(fetch)[0]).toContain('/trees/feat%2Fx%20y?');
  });
});

describe('isLfsPointer', () => {
  it('recognises a pointer', () => {
    expect(isLfsPointer(new TextEncoder().encode('version https://git-lfs.github.com/spec/v1\noid sha256:ab\n'))).toBe(true);
  });
  it('rejects images and short input', () => {
    expect(isLfsPointer(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isLfsPointer(new Uint8Array())).toBe(false);
  });
});
