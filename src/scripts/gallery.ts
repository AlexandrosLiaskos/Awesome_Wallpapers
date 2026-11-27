// The filterable wall of a listing. Its first page holds PAGE_SIZE cards. When
// the listing has more, the browser loads the compact index of the whole catalog
// after the first paint, and from then on search, filters, sort, the count and
// the viewer's order cover the listing's whole scope; cards further down are
// added as the visitor scrolls. If the index cannot be loaded, everything keeps
// working on the cards that are on the page, and the pager to the later pages
// comes back.

import { cardHtml, type CardData, type CompactIndex } from '../lib/card.ts';
import {
  EMPTY,
  matches,
  parseState,
  serializeState,
  sortSlugs,
  type FilterState,
  type Indexed,
} from '../lib/filter.ts';
import { formatCount } from '../lib/format.ts';
import { url } from '../lib/site.ts';
import { PAGE_SIZE, inScope, nextBatch, parseScope, scopePath, type WallScope } from '../lib/wall-batches.ts';
import { layoutAppended, layoutWall } from './layout.ts';

type Facet = 'size' | 'shape' | 'color' | 'sort';

let wall: HTMLElement | null = null;
/** Every wallpaper that matches the filters, in the order shown, whether its card is rendered yet or not. */
let order: string[] = [];

/** The slugs currently shown, in order, including those further down. The viewer and Random walk this list. */
export function visibleSlugs(): string[] {
  return order;
}

/** The link of a card on this page's wall, if there is one. */
export function cardOf(slug: string): HTMLAnchorElement | null {
  return wall?.querySelector<HTMLAnchorElement>(`[data-slug="${CSS.escape(slug)}"] > a`) ?? null;
}

function slugsOn(element: HTMLElement): string[] {
  return [...element.children].map((item) => (item as HTMLElement).dataset.slug ?? '');
}

function indexed(card: CardData): Indexed {
  const { slug, title, tags, size, shape, colors } = card;
  return { slug, title, tags, size, shape, colors, pixels: card.width * card.height };
}

/** Runs once the page has settled, without holding up the first screen. */
function whenIdle(task: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(task, { timeout: 1500 });
  else setTimeout(task, 1500);
}

function randomOf(slugs: string[]): string {
  return slugs[Math.floor(Math.random() * slugs.length)];
}

function plainClick(event: MouseEvent): boolean {
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

/** Wires search, tags, facets, sort and the Random button to the page's filterable wall. */
export function initGallery(open: (slug: string) => void): void {
  wall = document.querySelector<HTMLElement>('[data-wall][data-filterable]');
  if (!wall) return;

  const scope = parseScope(wall.dataset.scope ?? '');
  const page = Number(wall.dataset.page) || 1;
  if (page > 1 && scope) initLaterPage(wall, scope, page, open);
  else initFirstPage(wall, scope, open);
}

/**
 * A later page shows its own cards with the normal layout. Its filters lead
 * back to the first page of the listing, where they cover the whole scope.
 */
function initLaterPage(wall: HTMLElement, scope: WallScope, page: number, open: (slug: string) => void): void {
  order = slugsOn(wall);
  const total = Number(wall.dataset.total) || order.length;
  const start = (page - 1) * PAGE_SIZE + 1;
  const count = document.querySelector<HTMLElement>('[data-count]');
  if (count) count.textContent = `${formatCount(start)} to ${formatCount(start + order.length - 1)} of ${formatCount(total)} wallpapers`;

  document.querySelector('[data-filters]')?.addEventListener('click', (event) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>('[data-facet] [data-value]');
    if (!option) return;
    const facet = option.closest<HTMLElement>('[data-facet]')!.dataset.facet as Facet;
    const query = serializeState({ ...EMPTY, [facet]: option.dataset.value ?? '' });
    // The options already on (Any, Featured) change nothing here.
    if (query) location.assign(url(scopePath(scope)) + query);
  });

  document.addEventListener('click', (event) => {
    const random = (event.target as HTMLElement).closest('[data-random]');
    if (random && order.length > 0 && !(event.metaKey || event.ctrlKey || event.shiftKey)) {
      event.preventDefault();
      open(randomOf(order));
    }
  });
}

function initFirstPage(wall: HTMLElement, scope: WallScope | null, open: (slug: string) => void): void {
  const bar = document.querySelector<HTMLElement>('[data-filters]');
  const search = document.querySelector<HTMLInputElement>('[data-search]');
  const count = document.querySelector<HTMLElement>('[data-count]');
  const empty = document.querySelector<HTMLElement>('[data-empty]');
  const pager = document.querySelector<HTMLElement>('[data-pager][data-scroll]');
  const sentinel = document.querySelector<HTMLElement>('[data-wall-more]');
  // On a tag's or a collection's page the chips are ordinary links and the search goes to the full gallery.
  const inPlace = bar?.dataset.mode === 'filter';
  const total = Number(wall.dataset.total) || wall.children.length;
  // The rest of the listing comes from the index and is shown by scrolling. A listing
  // whose cards are all on the page needs neither: the index would change no result.
  const scrolls =
    scope !== null && total > wall.children.length && sentinel !== null && typeof IntersectionObserver === 'function';

  // Until the index arrives (or if it never does) the cards on the page are all there is.
  const embedded = document.querySelector('[data-wall-index]');
  if (!embedded) return;
  let entries = JSON.parse(embedded.textContent ?? '[]') as Indexed[];
  /** The index's cards, by slug, once it has loaded. */
  let catalog: Map<string, CardData> | null = null;
  let labels: Record<string, string> = {};
  let failed = false;
  /** Card elements by slug: the server's and those built since. Kept when filtered out, to be reused. */
  const cards = new Map(slugsOn(wall).map((slug, i) => [slug, wall.children[i] as HTMLElement]));

  // A tag in the address may lie beyond the first page, so it is taken as given
  // and checked against the index's tags once they are known.
  const tagParam = new URLSearchParams(location.search).get('tag') ?? '';
  let state: FilterState = parseState(location.search, inPlace ? [tagParam] : []);
  if (!inPlace) state.q = '';

  const isFiltered = () => serializeState({ ...state, sort: 'featured' }) !== '';

  /** Builds the cards of these slugs that do not exist yet, from the index. */
  function build(slugs: string[]): void {
    const missing = slugs.filter((slug) => !cards.has(slug));
    if (missing.length === 0 || !catalog) return;
    const template = document.createElement('template');
    const base = url('/');
    template.innerHTML = missing.map((slug) => cardHtml(catalog!.get(slug)!, { eager: false, base, labels })).join('');
    for (const item of template.content.children) cards.set((item as HTMLElement).dataset.slug ?? '', item as HTMLElement);
  }

  /** Puts exactly these cards on the wall, in this order. */
  function place(slugs: string[]): void {
    const current = slugsOn(wall);
    const same = current.length === slugs.length && current.every((slug, i) => slug === slugs[i]);
    // The same cards keep the layout they have; the resize observer keeps it right for the width.
    if (same && wall.hasAttribute('data-ready')) return;
    if (!same) {
      build(slugs);
      wall.replaceChildren(...slugs.map((slug) => cards.get(slug)!));
    }
    layoutWall(wall);
  }

  /** Adds the next batch of the current order below the cards already shown. */
  function more(): void {
    const batch = nextBatch(order, new Set(slugsOn(wall)));
    if (batch.length === 0) return;
    build(batch);
    wall.append(...batch.map((slug) => cards.get(slug)!));
    layoutAppended(wall);
    watch();
  }

  const observer = scrolls
    ? new IntersectionObserver(
        (records) => {
          if (!records.some((record) => record.isIntersecting)) return;
          // Near the end of the first page before the index is in: fetch it now; it adds the rest when it arrives.
          if (!catalog && !failed) void loadIndex();
          else more();
        },
        { rootMargin: '1500px' },
      )
    : null;

  /** Asks the observer again, since it reports only changes and the sentinel may still be in range after a batch. */
  function watch(): void {
    if (!observer || !sentinel) return;
    observer.unobserve(sentinel);
    observer.observe(sentinel);
  }

  function countText(): string {
    const scopeTotal = catalog ? entries.length : total;
    // Before the index arrives an unfiltered wall still stands for the whole scope, which scrolling will load.
    const shown = catalog || failed || isFiltered() ? order.length : scopeTotal;
    return shown === scopeTotal ? `${formatCount(scopeTotal)} wallpapers` : `${formatCount(shown)} of ${formatCount(scopeTotal)} wallpapers`;
  }

  function render(): void {
    order = sortSlugs(entries.filter((entry) => matches(entry, state)), state.sort);
    place(order.slice(0, PAGE_SIZE));
    watch();

    if (count) count.textContent = countText();
    if (empty) empty.hidden = order.length > 0;
    for (const clear of document.querySelectorAll<HTMLElement>('.filters [data-clear]')) clear.hidden = !isFiltered();

    for (const chip of bar?.querySelectorAll<HTMLElement>('[data-tag]') ?? []) {
      if (!inPlace) break;
      if (chip.dataset.tag === state.tag) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
    }
    for (const group of bar?.querySelectorAll<HTMLElement>('[data-facet]') ?? []) {
      const value = state[group.dataset.facet as Facet];
      for (const button of group.querySelectorAll<HTMLElement>('[data-value]')) {
        button.setAttribute('aria-pressed', String(button.dataset.value === value));
      }
    }
    if (search && inPlace && search.value !== state.q && document.activeElement !== search) search.value = state.q;

    // The index can arrive while the viewer is open; the address is then the wallpaper's.
    if (!history.state?.viewer) {
      history.replaceState(history.state, '', location.pathname + serializeState(state) + location.hash);
    }
  }

  /** After a change, brings the start of the new order into view if the visitor had scrolled past it. */
  function toStart(): void {
    // On wide screens the header and the filter bar stay at the top and cover the page under them.
    const covered = Math.max(0, bar?.getBoundingClientRect().bottom ?? 0);
    const top = wall.getBoundingClientRect().top;
    if (top < covered) scrollBy({ top: top - covered });
  }

  let loading: Promise<void> | null = null;

  function loadIndex(): Promise<void> {
    if (!scrolls || !scope) return Promise.resolve();
    loading ??= fetch(url('/api/index.json'))
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const index = (await response.json()) as CompactIndex;
        if (!Array.isArray(index?.items)) throw new Error('The index has no items');
        return index;
      })
      // Two handlers rather than a catch, so that a mistake in applying the index is not taken for a failed request.
      .then(
        (index) => {
          labels = index.labels ?? {};
          const items = index.items.filter((item) => inScope(item, scope));
          catalog = new Map(items.map((item) => [item.slug, item]));
          entries = items.map(indexed);
          if (state.tag && !Object.hasOwn(labels, state.tag)) state.tag = '';
          render();
        },
        () => {
          // The browser has already reported the failed request; the page goes on with its own cards.
          failed = true;
          if (pager) pager.hidden = false;
          render();
        },
      );
    return loading;
  }

  function changed(): void {
    render();
    toStart();
    // Filters on the first page alone would miss most matches of a longer listing, so the index is wanted now.
    void loadIndex();
  }

  bar?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    const chip = target.closest<HTMLAnchorElement>('a[data-tag]');
    if (chip && inPlace && plainClick(event)) {
      event.preventDefault();
      state.tag = chip.dataset.tag === state.tag ? '' : (chip.dataset.tag ?? '');
      changed();
      return;
    }

    const option = target.closest<HTMLElement>('[data-facet] [data-value]');
    if (option) {
      const facet = option.closest<HTMLElement>('[data-facet]')!.dataset.facet as Facet;
      const value = option.dataset.value ?? '';
      // Pressing the active colour again releases it; the other groups always have one option on.
      const next = facet === 'color' && state.color === value ? '' : value;
      state = { ...state, [facet]: next };
      changed();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-clear]')) {
      state = { ...EMPTY, sort: state.sort };
      if (search && inPlace) search.value = '';
      changed();
    }
    const random = target.closest('[data-random]');
    if (random && order.length > 0 && !(event.metaKey || event.ctrlKey || event.shiftKey)) {
      event.preventDefault();
      open(randomOf(order));
    }
  });

  if (search && inPlace) {
    search.value = state.q;
    search.addEventListener('input', () => {
      state.q = search.value.trim();
      changed();
    });
    search.form?.addEventListener('submit', (event) => event.preventDefault());
  }

  render();
  if (!scrolls) return;

  // Scrolling is installed (render() started the observer), so it takes over from the
  // pager. Until this line runs, for instance if the script fails, the pager stays.
  if (pager) pager.hidden = true;
  if (serializeState(state) !== '') void loadIndex(); // The address asks for filters or a sort, which need the whole scope.
  else whenIdle(() => void loadIndex());
}
