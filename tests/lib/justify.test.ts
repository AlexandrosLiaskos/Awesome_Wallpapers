import { describe, expect, it } from 'vitest';
import { justify, justifyRows, type Box } from '../../src/lib/justify.ts';

const opts = { targetHeight: 200, gap: 6 };

/** Splits boxes into rows the way a wrapping flex container would. */
function rows(boxes: Box[], width: number, gap: number): Box[][] {
  const out: Box[][] = [[]];
  let used = 0;
  for (const box of boxes) {
    const row = out[out.length - 1];
    const needed = (row.length ? gap : 0) + box.width;
    if (row.length && used + needed > width + 0.5) {
      out.push([box]);
      used = box.width;
    } else {
      row.push(box);
      used += needed;
    }
  }
  return out;
}

const mixed = [16 / 9, 16 / 9, 21 / 9, 16 / 10, 9 / 19.5, 16 / 9, 32 / 9, 4 / 3, 16 / 9, 16 / 9, 3 / 2];

describe('justify', () => {
  it('returns one box per image', () => {
    expect(justify(mixed, 1200, opts)).toHaveLength(mixed.length);
  });

  it('fills every row but the last to the container width', () => {
    const laid = rows(justify(mixed, 1200, opts), 1200, opts.gap);
    for (const row of laid.slice(0, -1)) {
      const used = row.reduce((sum, box) => sum + box.width, 0) + opts.gap * (row.length - 1);
      expect(Math.abs(used - 1200)).toBeLessThan(1);
    }
  });

  it('keeps every image in its own aspect ratio', () => {
    justify(mixed, 1200, opts).forEach((box, index) => {
      expect(box.width / box.height / mixed[index]).toBeCloseTo(1, 2);
    });
  });

  it('gives all images in a row the same height', () => {
    for (const row of rows(justify(mixed, 1200, opts), 1200, opts.gap)) {
      for (const box of row) expect(box.height).toBeCloseTo(row[0].height, 1);
    }
  });

  it('keeps row heights near the target', () => {
    const laid = rows(justify(mixed, 1200, opts), 1200, opts.gap);
    for (const row of laid.slice(0, -1)) {
      expect(row[0].height).toBeGreaterThan(opts.targetHeight * 0.6);
      expect(row[0].height).toBeLessThan(opts.targetHeight * 1.5);
    }
  });

  it('leaves the last row at the target height instead of stretching it', () => {
    const boxes = justify([16 / 9, 16 / 9, 16 / 9, 16 / 9, 16 / 9], 1200, opts);
    expect(boxes.at(-1)!.height).toBe(opts.targetHeight);
  });

  it('shrinks a lone ultrawide image to fit a phone screen', () => {
    const [box] = justify([32 / 9], 360, { targetHeight: 110, gap: 4 });
    expect(box.width).toBeCloseTo(360, 0);
    expect(box.height).toBeCloseTo(101, 0);
  });

  it('never makes an image wider than the container', () => {
    for (const box of justify([2048 / 576, 1080 / 2340, 2048 / 576], 360, { targetHeight: 110, gap: 4 })) {
      expect(box.width).toBeLessThanOrEqual(360);
    }
  });

  it('returns nothing for nothing', () => {
    expect(justify([], 1200, opts)).toEqual([]);
  });

  it('returns finite sizes when the container has no width yet', () => {
    for (const box of justify(mixed, 0, opts)) {
      expect(Number.isFinite(box.width) && box.width >= 0).toBe(true);
      expect(Number.isFinite(box.height) && box.height >= 0).toBe(true);
    }
  });
});

describe('justifyRows', () => {
  // A long, varied wall: desktop, ultrawide, phone and square images in a fixed pseudo-random order.
  const shapes = [16 / 9, 21 / 9, 32 / 9, 16 / 10, 4 / 3, 1, 9 / 19.5, 3 / 2];
  const many = Array.from({ length: 400 }, (_, i) => shapes[(i * 7 + (i >> 2)) % shapes.length]);

  it('gives the same boxes as justify', () => {
    expect(justifyRows(mixed, 1200, opts).boxes).toEqual(justify(mixed, 1200, opts));
  });

  it('settles every row before the last one, so a batch added at the end only lays out that row and the batch', () => {
    for (const width of [360, 1200, 2560]) {
      const o = { targetHeight: width < 640 ? 110 : 220, gap: 6 };
      const whole = justify(many, width, o);
      for (const shown of [1, 7, 120, 240, 361]) {
        const { boxes, lastRow } = justifyRows(many.slice(0, shown), width, o);
        expect(lastRow).toBeLessThanOrEqual(shown);
        // The settled rows are already final...
        expect(boxes.slice(0, lastRow)).toEqual(whole.slice(0, lastRow));
        // ...and justifying from the last row on gives the rest exactly.
        expect(justify(many.slice(lastRow), width, o)).toEqual(whole.slice(lastRow));
      }
    }
  });

  it('starts the last row at the end when the images fill their last row exactly', () => {
    const { lastRow } = justifyRows([1, 1], 406, { targetHeight: 200, gap: 6 });
    expect(lastRow).toBe(2);
  });
});
