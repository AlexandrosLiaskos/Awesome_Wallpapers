import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRepoStats } from '../../src/lib/repo-stats.ts';
import { getStars } from '../../src/lib/stars.ts';

// Answers are memoised per repository for the whole run, so every test asks about its own.
let api: ReturnType<typeof vi.fn>;

function answer(body: unknown, status = 200): void {
  api.mockImplementation(async () => new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  api = vi.fn();
  vi.stubGlobal('fetch', api);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getRepoStats', () => {
  it('reads the star count and the description from the GitHub API', async () => {
    answer({ stargazers_count: 1889, description: 'Wallpapers inspired by Rosé Pine' });
    expect(await getRepoStats('rose-pine/wallpapers')).toEqual({ stars: 1889, description: 'Wallpapers inspired by Rosé Pine' });
    expect(api).toHaveBeenCalledWith('https://api.github.com/repos/rose-pine/wallpapers', expect.anything());
  });

  it('trims the description and treats an empty one as none', async () => {
    answer({ stargazers_count: 0, description: 'An awesome collection of aesthetic wallpapers ' });
    expect((await getRepoStats('owner/trailing')).description).toBe('An awesome collection of aesthetic wallpapers');
    answer({ stargazers_count: 3, description: '  ' });
    expect(await getRepoStats('owner/blank')).toEqual({ stars: 3, description: null });
    answer({ stargazers_count: 3, description: null });
    expect(await getRepoStats('owner/none')).toEqual({ stars: 3, description: null });
  });

  it('gives nulls when GitHub cannot be read', async () => {
    answer({ message: 'Not Found' }, 404);
    expect(await getRepoStats('owner/missing')).toEqual({ stars: null, description: null });
    api.mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await getRepoStats('owner/offline')).toEqual({ stars: null, description: null });
    api.mockImplementation(async () => new Response('<html>', { status: 200 }));
    expect(await getRepoStats('owner/garbled')).toEqual({ stars: null, description: null });
  });

  it('keeps a field it cannot use as null and the other one', async () => {
    answer({ stargazers_count: '12', description: 'Gruvbox theme Wallpapers' });
    expect(await getRepoStats('owner/odd')).toEqual({ stars: null, description: 'Gruvbox theme Wallpapers' });
  });

  it('asks once per repository', async () => {
    answer({ stargazers_count: 7, description: 'x' });
    await Promise.all([getRepoStats('owner/once'), getRepoStats('owner/once'), getRepoStats('Owner/Once')]);
    expect(api).toHaveBeenCalledTimes(1);
    await getRepoStats('owner/other');
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('sends the token when there is one, and sets a time limit', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'secret');
    answer({ stargazers_count: 1, description: 'x' });
    await getRepoStats('owner/token');
    const init = api.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer secret');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('getStars', () => {
  it("is the star count of the gallery's own repository", async () => {
    answer({ stargazers_count: 122, description: 'A fast, searchable gallery' });
    expect(await getStars()).toBe(122);
    expect(api).toHaveBeenCalledWith('https://api.github.com/repos/AlexandrosLiaskos/Awesome_Wallpapers', expect.anything());
  });
});
