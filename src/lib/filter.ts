import type { ColorBucket, Shape, SizeClass } from './types.ts';

export type Sort = 'featured' | 'resolution' | 'name';
export type SizeFilter = '' | '4k' | 'qhd' | 'fhd';

export interface FilterState {
  q: string;
  tag: string;
  /** A minimum: "qhd" also shows 4K. */
  size: SizeFilter;
  shape: '' | Shape;
  color: '' | ColorBucket;
  sort: Sort;
}

export const EMPTY: FilterState = { q: '', tag: '', size: '', shape: '', color: '', sort: 'featured' };

/** What the browser needs to know about a wallpaper to filter and sort it. */
export interface Indexed {
  slug: string;
  title: string;
  tags: string[];
  size: SizeClass;
  shape: Shape;
  colors: ColorBucket[];
  pixels: number;
}

const SIZES: SizeFilter[] = ['4k', 'qhd', 'fhd'];
const SHAPES: Shape[] = ['desktop', 'ultrawide', 'phone'];
export const COLORS: ColorBucket[] = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'dark', 'light'];
const SORTS: Sort[] = ['featured', 'resolution', 'name'];

/** From largest to smallest; a filter accepts its own class and every class before it. */
const SIZE_RANK: SizeClass[] = ['4k', 'qhd', 'fhd', 'hd'];

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | '' {
  return allowed.includes(value as T) ? (value as T) : '';
}

/** Reads the filters from an address's query string. Anything unknown is ignored. */
export function parseState(search: string, knownTags: string[]): FilterState {
  const params = new URLSearchParams(search);
  return {
    q: (params.get('q') ?? '').trim(),
    tag: oneOf(params.get('tag'), knownTags),
    size: oneOf(params.get('size'), SIZES),
    shape: oneOf(params.get('shape'), SHAPES),
    color: oneOf(params.get('color'), COLORS),
    sort: oneOf(params.get('sort'), SORTS) || 'featured',
  };
}

/** The query string for a set of filters; empty when nothing is set. */
export function serializeState(state: FilterState): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.tag) params.set('tag', state.tag);
  if (state.size) params.set('size', state.size);
  if (state.shape) params.set('shape', state.shape);
  if (state.color) params.set('color', state.color);
  if (state.sort !== 'featured') params.set('sort', state.sort);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Lower-case letters and digits only, so "Let's Go" and "lets go" compare equal. */
function plain(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function matchesText(wallpaper: Indexed, query: string): boolean {
  const haystack = [wallpaper.title, ...wallpaper.tags, wallpaper.size, wallpaper.shape].map(plain).join(' ');
  return query
    .split(/\s+/)
    .map(plain)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function matches(wallpaper: Indexed, state: FilterState): boolean {
  if (state.tag && !wallpaper.tags.includes(state.tag)) return false;
  if (state.size && SIZE_RANK.indexOf(wallpaper.size) > SIZE_RANK.indexOf(state.size)) return false;
  if (state.shape && wallpaper.shape !== state.shape) return false;
  if (state.color && !wallpaper.colors.includes(state.color)) return false;
  if (state.q && !matchesText(wallpaper, state.q)) return false;
  return true;
}

/** The slugs in display order. "featured" is the order the list already has. */
export function sortSlugs(list: Indexed[], sort: Sort): string[] {
  const sorted = [...list];
  if (sort === 'resolution') sorted.sort((a, b) => b.pixels - a.pixels);
  if (sort === 'name') sorted.sort((a, b) => a.title.localeCompare(b.title, 'en', { sensitivity: 'base' }));
  return sorted.map((wallpaper) => wallpaper.slug);
}
