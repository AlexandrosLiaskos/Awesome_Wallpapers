// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveAs } from '../../src/scripts/download.ts';

const FILE = 'https://raw.githubusercontent.com/o/r/main/images/Night%20City.png';

/** Records what the temporary download link looked like when it was clicked. */
function watchDownloads() {
  const clicks: { href: string; download: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicks.push({ href: this.href, download: this.download });
  });
  return clicks;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('saveAs', () => {
  it('saves the fetched file under the given name', async () => {
    const clicks = watchDownloads();
    const fetch = vi.fn(async () => new Response(new Blob(['image bytes'])));
    const open = vi.fn();

    const outcome = await saveAs(FILE, 'Night City.png', { fetch, open });

    expect(outcome).toBe('saved');
    expect(fetch).toHaveBeenCalledWith(FILE);
    expect(clicks).toHaveLength(1);
    expect(clicks[0].download).toBe('Night City.png');
    expect(clicks[0].href).toMatch(/^blob:/);
    expect(open).not.toHaveBeenCalled();
  });

  it('leaves no link behind in the page', async () => {
    watchDownloads();
    await saveAs(FILE, 'a.png', { fetch: async () => new Response(new Blob(['x'])), open: vi.fn() });
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });

  it('opens the original when the request fails', async () => {
    const clicks = watchDownloads();
    const open = vi.fn();
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    expect(await saveAs(FILE, 'a.png', { fetch, open })).toBe('opened');
    expect(open).toHaveBeenCalledWith(FILE);
    expect(clicks).toHaveLength(0);
  });

  it('opens the original when the server answers with an error', async () => {
    const open = vi.fn();
    const fetch = vi.fn(async () => new Response('not found', { status: 404 }));

    expect(await saveAs(FILE, 'a.png', { fetch, open })).toBe('opened');
    expect(open).toHaveBeenCalledWith(FILE);
  });
});
