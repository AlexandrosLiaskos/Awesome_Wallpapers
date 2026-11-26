import {
  EMPTY,
  matches,
  parseState,
  serializeState,
  sortSlugs,
  type FilterState,
  type Indexed,
} from '../lib/filter.ts';
import { layoutWall } from './layout.ts';

type Facet = 'size' | 'shape' | 'color' | 'sort';

let wall: HTMLElement | null = null;

/** The slugs currently shown, in the order they appear. The viewer walks this list. */
export function visibleSlugs(): string[] {
  if (!wall) return [];
  return [...wall.children]
    .filter((item): item is HTMLElement => item instanceof HTMLElement && !item.hidden)
    .map((item) => item.dataset.slug ?? '');
}

/** The link of a card on this page's wall, if there is one. */
export function cardOf(slug: string): HTMLAnchorElement | null {
  return wall?.querySelector<HTMLAnchorElement>(`[data-slug="${CSS.escape(slug)}"] > a`) ?? null;
}

/** Wires search, tags, facets, sort and the Random button to the page's filterable wall. */
export function initGallery(open: (slug: string) => void): void {
  wall = document.querySelector<HTMLElement>('[data-wall][data-filterable]');
  const indexSource = document.querySelector('[data-wall-index]');
  if (!wall || !indexSource) return;

  const index = JSON.parse(indexSource.textContent ?? '[]') as Indexed[];
  const items = new Map(
    [...wall.children].map((item) => [(item as HTMLElement).dataset.slug ?? '', item as HTMLElement]),
  );
  const bar = document.querySelector<HTMLElement>('[data-filters]');
  const search = document.querySelector<HTMLInputElement>('[data-search]');
  const count = document.querySelector<HTMLElement>('[data-count]');
  const empty = document.querySelector<HTMLElement>('[data-empty]');
  // On a tag's own page the chips are ordinary links and the search goes to the full gallery.
  const inPlace = bar?.dataset.mode === 'filter';
  const knownTags = [...new Set(index.flatMap((wallpaper) => wallpaper.tags))];

  let state: FilterState = parseState(location.search, inPlace ? knownTags : []);
  if (!inPlace) state.q = '';
  let appliedSort = 'featured';

  const isFiltered = () => serializeState({ ...state, sort: 'featured' }) !== '';

  function render(): void {
    const shown = new Set(index.filter((wallpaper) => matches(wallpaper, state)).map((wallpaper) => wallpaper.slug));

    if (state.sort !== appliedSort) {
      for (const slug of sortSlugs(index, state.sort)) wall!.append(items.get(slug)!);
      appliedSort = state.sort;
    }
    for (const [slug, item] of items) item.hidden = !shown.has(slug);
    layoutWall(wall!);

    if (count) {
      count.textContent =
        shown.size === index.length ? `${index.length} wallpapers` : `${shown.size} of ${index.length} wallpapers`;
    }
    if (empty) empty.hidden = shown.size > 0;
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

    history.replaceState(history.state, '', location.pathname + serializeState(state) + location.hash);
  }

  bar?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    const chip = target.closest<HTMLAnchorElement>('a[data-tag]');
    const plainClick = !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
    if (chip && inPlace && plainClick) {
      event.preventDefault();
      state.tag = chip.dataset.tag === state.tag ? '' : (chip.dataset.tag ?? '');
      render();
      return;
    }

    const option = target.closest<HTMLElement>('[data-facet] [data-value]');
    if (option) {
      const facet = option.closest<HTMLElement>('[data-facet]')!.dataset.facet as Facet;
      const value = option.dataset.value ?? '';
      // Pressing the active colour again releases it; the other groups always have one option on.
      const next = facet === 'color' && state.color === value ? '' : value;
      state = { ...state, [facet]: next };
      render();
    }
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-clear]')) {
      state = { ...EMPTY, sort: state.sort };
      if (search && inPlace) search.value = '';
      render();
    }
    const random = target.closest<HTMLAnchorElement>('[data-random]');
    const slugs = visibleSlugs();
    if (random && slugs.length > 0 && !(event.metaKey || event.ctrlKey || event.shiftKey)) {
      event.preventDefault();
      open(slugs[Math.floor(Math.random() * slugs.length)]);
    }
  });

  if (search && inPlace) {
    search.value = state.q;
    search.addEventListener('input', () => {
      state.q = search.value.trim();
      render();
    });
    search.form?.addEventListener('submit', (event) => event.preventDefault());
  }

  render();
}
