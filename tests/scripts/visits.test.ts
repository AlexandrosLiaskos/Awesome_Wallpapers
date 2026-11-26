// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { VISITS_ENDPOINT, recordVisit } from '../../src/scripts/visits.ts';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: () => null,
    get length() {
      return values.size;
    },
  };
}

const answer = (count: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify({ count }), { status }));

describe('recordVisit', () => {
  it('records the first page of a browser session with POST and returns the total', async () => {
    const fetch = answer(42);
    expect(await recordVisit({ fetch, storage: memoryStorage() })).toBe(42);
    expect(fetch).toHaveBeenCalledWith(VISITS_ENDPOINT, expect.objectContaining({ method: 'POST', credentials: 'omit' }));
  });

  it('only reads the total on later pages of the same session', async () => {
    const storage = memoryStorage();
    await recordVisit({ fetch: answer(42), storage });
    const fetch = answer(42);
    await recordVisit({ fetch, storage });
    expect(fetch).toHaveBeenCalledWith(VISITS_ENDPOINT, expect.objectContaining({ method: 'GET' }));
  });

  it('still counts the visit when the browser refuses storage', async () => {
    const storage = memoryStorage();
    storage.getItem = () => {
      throw new Error('blocked');
    };
    storage.setItem = () => {
      throw new Error('blocked');
    };
    expect(await recordVisit({ fetch: answer(7), storage })).toBe(7);
  });

  it('returns nothing, and counts the visit next time, when the counter cannot be reached', async () => {
    const storage = memoryStorage();
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await recordVisit({ fetch: offline, storage })).toBeNull();
    const fetch = answer(3);
    await recordVisit({ fetch, storage });
    expect(fetch).toHaveBeenCalledWith(VISITS_ENDPOINT, expect.objectContaining({ method: 'POST' }));
  });

  it('returns nothing for an error answer or a count that is not a number', async () => {
    expect(await recordVisit({ fetch: answer(5, 503), storage: memoryStorage() })).toBeNull();
    expect(await recordVisit({ fetch: answer('many'), storage: memoryStorage() })).toBeNull();
    expect(await recordVisit({ fetch: answer(-1), storage: memoryStorage() })).toBeNull();
  });
});
