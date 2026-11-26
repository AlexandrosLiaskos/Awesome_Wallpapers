import { justify } from '../lib/justify.ts';

/** Row height the wall aims for at a given width: two images per row on phones, more as it widens. */
function targetHeight(width: number): number {
  if (width < 640) return 110;
  return Math.min(270, Math.max(150, width * 0.175));
}

/** Gives every visible card of a wall its exact size. */
export function layoutWall(wall: HTMLElement): void {
  // The exact width, not clientWidth: at fractional zoom levels clientWidth is
  // rounded up, and a row that is a fraction of a pixel too wide wraps.
  const width = wall.getBoundingClientRect().width - 0.5;
  if (width <= 0) return;

  const items = [...wall.children].filter((item): item is HTMLElement => item instanceof HTMLElement && !item.hidden);
  const ratios = items.map((item) => Number(item.style.getPropertyValue('--ar')) || 16 / 9);
  const gap = parseFloat(getComputedStyle(wall).columnGap) || 0;
  const boxes = justify(ratios, width, { targetHeight: targetHeight(width), gap });

  items.forEach((item, index) => {
    item.style.width = `${boxes[index].width}px`;
    item.style.height = `${boxes[index].height}px`;
  });
  wall.dataset.ready = '';
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
    wall.dataset.width = String(wall.clientWidth);
    observer.observe(wall);
  }
}
