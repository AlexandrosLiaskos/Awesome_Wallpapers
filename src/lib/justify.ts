export interface Box {
  width: number;
  height: number;
}

interface Options {
  /** The height rows aim for. */
  targetHeight: number;
  /** Space between images in a row. */
  gap: number;
}

/** A row may grow this much above the target before a narrower row is preferred. */
const MAX_GROWTH = 1.5;

/**
 * Lays images out in rows that fill the container's width, keeping every
 * image in its own aspect ratio (nothing is cropped).
 *
 * Images are added to a row until it is full. The row then takes whichever
 * of two heights is closer to the target: the one that fits all its images,
 * or the one that fits all but the last. The final row is left at the target
 * height rather than stretched.
 */
export function justify(ratios: number[], containerWidth: number, opts: Options): Box[] {
  const { targetHeight, gap } = opts;
  if (!(containerWidth > 0)) return ratios.map(() => ({ width: 0, height: 0 }));

  const boxes: Box[] = [];
  /** The height at which images of these ratios exactly fill the container. */
  const fit = (row: number[]) => (containerWidth - gap * (row.length - 1)) / row.reduce((sum, r) => sum + r, 0);
  const place = (row: number[], height: number) => {
    for (const ratio of row) boxes.push({ width: round(ratio * height), height: round(height) });
  };

  let row: number[] = [];
  for (const ratio of ratios) {
    row.push(ratio);
    const full = fit(row);
    if (full > targetHeight) continue; // still room at the target height

    const shorter = row.length > 1 ? fit(row.slice(0, -1)) : Infinity;
    const preferShorter = shorter <= targetHeight * MAX_GROWTH && shorter - targetHeight < targetHeight - full;
    if (preferShorter) {
      place(row.slice(0, -1), shorter);
      row = [ratio];
    } else {
      place(row, full);
      row = [];
    }
  }

  if (row.length > 0) place(row, Math.min(targetHeight, fit(row)));
  return boxes;
}

/** Rounded down, so a row never overflows its container by a fraction of a pixel. */
function round(value: number): number {
  return Math.floor(value * 100) / 100;
}
