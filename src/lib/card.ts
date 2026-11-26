// One card, one function: the server renders the first cards with it and the
// browser renders the rest from the compact index, so both give the same markup.

import { collectionIdsOf } from './site-data.ts';
import type { ColorBucket, Shape, SizeClass, Wallpaper } from './types.ts';

/** What a card and the filters need to know about a wallpaper. */
export interface CardData {
  slug: string;
  title: string;
  width: number;
  height: number;
  tags: string[];
  size: SizeClass;
  shape: Shape;
  colors: ColorBucket[];
  /** The first palette colour, empty when the wallpaper has none. */
  colour: string;
  animated: boolean;
  /** The collections that hold it, by their ids under /sources/ (see `collectionIdsOf`). */
  sources: string[];
}

/** The body of /api/index.json. */
export interface CompactIndex {
  labels: Record<string, string>;
  items: CardData[];
}

export interface CardOptions {
  /** Load at once instead of lazily; for the first few cards on a page. */
  eager: boolean;
  /** The site's base path, ending in a slash. */
  base: string;
  /** Tag slug to label. */
  labels: Record<string, string>;
}

export function toCardData(w: Wallpaper): CardData {
  return {
    slug: w.slug,
    title: w.title,
    width: w.width,
    height: w.height,
    tags: w.tags,
    size: w.size,
    shape: w.shape,
    colors: w.colors,
    colour: w.palette[0]?.hex ?? '',
    animated: w.animated,
    sources: collectionIdsOf(w),
  };
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Safe for text and for double- or single-quoted attribute values. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

export function cardHtml(card: CardData, { eager, base, labels }: CardOptions): string {
  const { slug, title, width, height } = card;
  const ratio = width / height;
  const thumbWidth = Math.round(300 * ratio);
  const thumbnail = `${base}m/t/${slug}.webp`;
  const retina = `${base}m/t/${slug}@2x.webp`;
  const alt = `${title}: ${card.tags.map((tag) => labels[tag] ?? tag).join(', ')}`;
  const badge = card.animated ? 'GIF' : card.size === '4k' ? '4K' : '';

  return (
    `<li class="wall__item" data-slug="${escapeHtml(slug)}" style="--ar:${ratio.toFixed(4)};--c:${escapeHtml(card.colour)}">` +
    `<a class="card" href="${escapeHtml(`${base}w/${slug}/`)}">` +
    `<img src="${escapeHtml(thumbnail)}"` +
    ` srcset="${escapeHtml(thumbnail)} ${thumbWidth}w, ${escapeHtml(retina)} ${thumbWidth * 2}w"` +
    ` sizes="(max-width: 640px) 50vw, (max-width: 1100px) 34vw, 25vw"` +
    ` width="${thumbWidth}" height="300" alt="${escapeHtml(alt)}"` +
    ` loading="${eager ? 'eager' : 'lazy'}" decoding="async">` +
    (badge ? `<span class="card__badge">${badge}</span>` : '') +
    // The alt text already names the card, so the hover label is decoration.
    `<span class="card__label" aria-hidden="true">` +
    `<span class="card__title">${escapeHtml(title)}</span>` +
    `<span class="card__size">${width} × ${height}</span>` +
    `</span></a></li>`
  );
}
