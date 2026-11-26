// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CardData } from '../../src/lib/card.ts';
import { initGallery } from '../../src/scripts/gallery.ts';

/** Stands in for the browser's observer, so a test can see what is observed. */
class FakeObserver {
  static last: FakeObserver | null = null;
  observed = new Set<Element>();
  readonly callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeObserver.last = this;
  }
  observe(element: Element) {
    this.observed.add(element);
  }
  unobserve(element: Element) {
    this.observed.delete(element);
  }
  disconnect() {
    this.observed.clear();
  }
}

const card = (i: number): CardData => ({
  slug: `w${i}`,
  title: `W ${i}`,
  width: 1920,
  height: 1080,
  tags: ['nord'],
  size: 'fhd',
  shape: 'desktop',
  colors: ['blue'],
  colour: '#123456',
  animated: false,
});

/** A first page of a nord listing with `onPage` cards rendered out of `total`. */
function listing(total: number, onPage: number): void {
  const items = Array.from({ length: onPage }, (_, i) => `<li class="wall__item" data-slug="w${i}"></li>`).join('');
  const embedded = Array.from({ length: onPage }, (_, i) => {
    const { slug, title, tags, size, shape, colors } = card(i);
    return { slug, title, tags, size, shape, colors, pixels: 1920 * 1080 };
  });
  document.body.innerHTML = `
    <div class="filters" data-filters data-mode="links">
      <fieldset data-facet="size"><button type="button" data-value="4k">4K+</button></fieldset>
      <span data-count></span>
    </div>
    <ul class="wall" data-wall data-filterable data-scope="tag:nord" data-page="1" data-total="${total}">${items}</ul>
    <div data-wall-more></div>
    <script type="application/json" data-wall-index>${JSON.stringify(embedded)}</script>
    ${total > onPage ? '<nav class="pager" data-pager data-scroll></nav>' : ''}`;
}

let idle: (() => void) | null;
let fetchIndex: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // The gallery writes its filters into the address; start each test without any.
  history.replaceState(null, '', '/');
  idle = null;
  FakeObserver.last = null;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.stubGlobal('requestIdleCallback', (task: () => void) => {
    idle = task;
    return 1;
  });
  fetchIndex = vi.fn(
    async () => new Response(JSON.stringify({ labels: { nord: 'Nord' }, items: Array.from({ length: 300 }, (_, i) => card(i)) })),
  );
  vi.stubGlobal('fetch', fetchIndex);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const pager = () => document.querySelector<HTMLElement>('[data-pager]')!;
const sentinel = () => document.querySelector('[data-wall-more]')!;

describe('initGallery on a first page', () => {
  it('never asks for the index when every card of the listing is on the page', async () => {
    listing(24, 24);
    initGallery(() => {});
    idle?.();
    document.querySelector<HTMLElement>('[data-value="4k"]')!.click();
    FakeObserver.last?.callback([{ isIntersecting: true } as IntersectionObserverEntry], FakeObserver.last as never);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchIndex).not.toHaveBeenCalled();
    expect(document.querySelector('[data-count]')!.textContent).toBe('0 of 24 wallpapers');
  });

  it('hides the pager once scrolling is installed and loads the index when the page is idle', () => {
    listing(300, 120);
    initGallery(() => {});
    expect(FakeObserver.last?.observed.has(sentinel())).toBe(true);
    expect(pager().hidden).toBe(true);
    expect(fetchIndex).not.toHaveBeenCalled();
    idle!();
    expect(fetchIndex).toHaveBeenCalledWith('/api/index.json');
  });

  it('keeps the pager, and does not load the index, without IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    listing(300, 120);
    initGallery(() => {});
    idle?.();
    expect(pager().hidden).toBe(false);
    expect(fetchIndex).not.toHaveBeenCalled();
  });

  it('shows the pager again when the index cannot be loaded', async () => {
    fetchIndex.mockImplementation(async () => new Response('Not found', { status: 404 }));
    listing(300, 120);
    initGallery(() => {});
    expect(pager().hidden).toBe(true);
    idle!();
    await vi.waitFor(() => expect(document.querySelector('[data-count]')!.textContent).toBe('120 of 300 wallpapers'));
    expect(pager().hidden).toBe(false);
  });
});
