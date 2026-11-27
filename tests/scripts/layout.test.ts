// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { justify, justifyRows } from '../../src/lib/justify.ts';
import { layoutAppended, layoutWall } from '../../src/scripts/layout.ts';

const WIDTH = 1200;
// Desktop, ultrawide, phone and square images in a fixed order.
const shapes = [16 / 9, 21 / 9, 9 / 19.5, 16 / 10, 1, 32 / 9, 4 / 3];
const ratioOf = (i: number) => shapes[(i * 5 + (i >> 1)) % shapes.length];

function cards(from: number, to: number): HTMLElement[] {
  return Array.from({ length: to - from }, (_, k) => {
    const item = document.createElement('li');
    item.dataset.slug = `w${from + k}`;
    item.style.setProperty('--ar', ratioOf(from + k).toFixed(4));
    item.innerHTML = '<a class="card"><img alt=""></a>';
    return item;
  });
}

/** A wall the browser would lay out at WIDTH; happy-dom does no layout, so the width is given. */
function wallOf(count: number): HTMLElement {
  const wall = document.createElement('ul');
  wall.append(...cards(0, count));
  wall.getBoundingClientRect = () => ({ width: WIDTH + 0.5 }) as DOMRect;
  document.body.replaceChildren(wall);
  return wall;
}

const ratios = (n: number) => Array.from({ length: n }, (_, i) => Number(ratioOf(i).toFixed(4)));
const opts = { targetHeight: Math.min(270, Math.max(150, WIDTH * 0.175)), gap: 0 };

describe('layoutAppended', () => {
  it('sizes only the last row and the new batch, and gives the same layout as laying out everything', () => {
    const wall = wallOf(120);
    layoutWall(wall);
    const { lastRow } = justifyRows(ratios(120), WIDTH, opts);
    expect(lastRow).toBeGreaterThan(100);

    const touched = new MutationObserver(() => {});
    touched.observe(wall, { attributes: true, attributeFilter: ['style'], subtree: true });
    wall.append(...cards(120, 240));
    layoutAppended(wall);
    const written = new Set(touched.takeRecords().map((record) => (record.target as HTMLElement).dataset.slug));
    touched.disconnect();

    const items = [...wall.children] as HTMLElement[];
    // The settled rows above the last one are not written to at all.
    expect(items.slice(0, lastRow).filter((item) => written.has(item.dataset.slug))).toEqual([]);
    expect(items.slice(lastRow).every((item) => written.has(item.dataset.slug))).toBe(true);
    // And the result is what a full layout of all 240 cards gives.
    const whole = justify(ratios(240), WIDTH, opts);
    expect(items.map((item) => [parseFloat(item.style.width), parseFloat(item.style.height)])).toEqual(
      whole.map((box) => [box.width, box.height]),
    );
  });

  it('lays out the whole wall when there is no layout to continue from', () => {
    const wall = wallOf(30);
    layoutAppended(wall);
    const whole = justify(ratios(30), WIDTH, opts);
    expect([...wall.children].map((item) => parseFloat((item as HTMLElement).style.width))).toEqual(
      whole.map((box) => box.width),
    );
    expect(wall.dataset.ready).toBe('');
  });

  it('records the width it laid the wall out for, so the resize observer can skip it', () => {
    const wall = wallOf(10);
    layoutWall(wall);
    expect(wall.dataset.width).toBe(String(Math.round(WIDTH + 0.5)));
  });
});
