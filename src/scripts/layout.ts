import { justifyRows } from '../lib/justify.ts';

/** Row height the wall aims for at a given width: two images per row on phones, more as it widens. */
function targetHeight(width: number): number {
  if (width < 640) return 110;
  return Math.min(270, Math.max(150, width * 0.175));
}

/** What the latest layout of a wall used, and where its unfinished last row starts. */
interface Laid {
  width: number;
  gap: number;
  /** Visible cards at the time, and the first of them on the last row. */
  count: number;
  lastRow: number;
}

const laid = new WeakMap<HTMLElement, Laid>();

function visibleItems(wall: HTMLElement): HTMLElement[] {
  return [...wall.children].filter((item): item is HTMLElement => item instanceof HTMLElement && !item.hidden);
}

/** Sizes these cards, which start at `from` among the wall's visible cards, and says where the last row now starts. */
function size(wall: HTMLElement, items: HTMLElement[], from: number, width: number, gap: number): void {
  const ratios = items.map((item) => Number(item.style.getPropertyValue('--ar')) || 16 / 9);
  const { boxes, lastRow } = justifyRows(ratios, width, { targetHeight: targetHeight(width), gap });

  items.forEach((item, index) => {
    item.style.width = `${boxes[index].width}px`;
    item.style.height = `${boxes[index].height}px`;
    // The exact width, so the browser picks the smallest thumbnail that is still sharp.
    const image = item.querySelector('img');
    if (image) image.sizes = `${Math.ceil(boxes[index].width)}px`;
  });
  laid.set(wall, { width, gap, count: from + items.length, lastRow: from + lastRow });
}

/** Gives every visible card of a wall its exact size. */
export function layoutWall(wall: HTMLElement): void {
  // The exact width, not clientWidth: at fractional zoom levels clientWidth is
  // rounded up, and a row that is a fraction of a pixel too wide wraps.
  const rect = wall.getBoundingClientRect().width;
  const width = rect - 0.5;
  if (width <= 0) return;

  const gap = parseFloat(getComputedStyle(wall).columnGap) || 0;
  size(wall, visibleItems(wall), 0, width, gap);
  // Read by the resize observer, which skips widths the wall is already laid out for.
  wall.dataset.width = String(Math.round(rect));
  wall.dataset.ready = '';
}

/**
 * Sizes the cards just added at the end of a wall. The rows above the last one
 * are settled (see `justifyRows`), so only that row and the new cards are touched,
 * and the script's work per batch does not grow with the cards above it.
 */
export function layoutAppended(wall: HTMLElement): void {
  const before = laid.get(wall);
  const items = visibleItems(wall);
  // Without a layout to continue from, or if cards went missing since, lay out everything.
  if (!before || items.length < before.count) {
    layoutWall(wall);
    return;
  }
  size(wall, items.slice(before.lastRow), before.lastRow, before.width, before.gap);
}

/** Lays out every wall on the page and keeps it laid out as the window changes width. */
export function initWalls(): void {
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const wall = entry.target as HTMLElement;
      const width = Math.round(entry.contentRect.width);
      if (wall.dataset.width === String(width)) continue;
      wall.dataset.width = String(width);
      layoutWall(wall);
    }
  });

  for (const wall of document.querySelectorAll<HTMLElement>('[data-wall]')) {
    layoutWall(wall);
    observer.observe(wall);
  }
}
