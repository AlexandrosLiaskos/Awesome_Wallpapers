import type { ImageFormat, Shape, SizeClass } from './types.ts';

/** Size class by the long edge, so a portrait 2160×3840 counts as 4K too. */
export function sizeClass(width: number, height: number): SizeClass {
  const longEdge = Math.max(width, height);
  if (longEdge >= 3840) return '4k';
  if (longEdge >= 2560) return 'qhd';
  if (longEdge >= 1920) return 'fhd';
  return 'hd';
}

export function shapeOf(width: number, height: number): Shape {
  if (height > width) return 'phone';
  if (width / height >= 2) return 'ultrawide';
  return 'desktop';
}

// "21:9" monitors are really 64:27 (2560×1080) or 43:18 (3440×1440), so the
// label is matched against the ratio people mean, not the arithmetic one.
const NAMED_RATIOS: [label: string, ratio: number][] = [
  ['16:9', 16 / 9],
  ['16:10', 16 / 10],
  ['21:9', 64 / 27],
  ['32:9', 32 / 9],
  ['3:2', 3 / 2],
  ['4:3', 4 / 3],
  ['5:4', 5 / 4],
  ['1:1', 1],
  ['9:16', 9 / 16],
  ['9:19.5', 9 / 19.5],
  ['9:20', 9 / 20],
];

const TOLERANCE = 0.03;

/** The familiar name of an aspect ratio, or the ratio itself when it has none. */
export function aspectLabel(width: number, height: number): string {
  const ratio = width / height;
  let best: { label: string; error: number } | undefined;
  for (const [label, named] of NAMED_RATIOS) {
    const error = Math.abs(ratio - named) / named;
    if (error <= TOLERANCE && (!best || error < best.error)) best = { label, error };
  }
  if (best) return best.label;
  return ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
}

export function formatOf(file: string): ImageFormat {
  const extension = file.slice(file.lastIndexOf('.') + 1).toUpperCase();
  return extension === 'JPEG' ? 'JPG' : (extension as ImageFormat);
}
