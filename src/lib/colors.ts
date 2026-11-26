import type { ColorBucket, Swatch } from './types.ts';

type Rgb = [number, number, number];

/** Colours closer than this (Euclidean distance in RGB) count as the same swatch. */
const MIN_DISTANCE = 48;

function distance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function toHex(rgb: Rgb): string {
  return '#' + rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('');
}

/**
 * The dominant colours of an image, most common first.
 *
 * Pixels are grouped into coarse cells (4 bits per channel) and each cell is
 * averaged. The most common cells that are visibly different from each other
 * become swatches, and every other cell is counted towards its nearest swatch,
 * so the shares add up to 1.
 */
export function paletteFromRgb(rgb: Uint8Array, count = 5): Swatch[] {
  const pixelCount = Math.floor(rgb.length / 3);
  if (pixelCount === 0) return [];

  const cells = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixelCount * 3; i += 3) {
    const key = ((rgb[i] >> 4) << 8) | ((rgb[i + 1] >> 4) << 4) | (rgb[i + 2] >> 4);
    const cell = cells.get(key);
    if (cell) {
      cell.n += 1;
      cell.r += rgb[i];
      cell.g += rgb[i + 1];
      cell.b += rgb[i + 2];
    } else {
      cells.set(key, { n: 1, r: rgb[i], g: rgb[i + 1], b: rgb[i + 2] });
    }
  }

  const colours = [...cells.values()]
    .sort((a, b) => b.n - a.n)
    .map((cell) => ({ n: cell.n, rgb: [cell.r / cell.n, cell.g / cell.n, cell.b / cell.n] as Rgb }));

  const picked: { n: number; rgb: Rgb }[] = [];
  for (const colour of colours) {
    if (picked.length === count) break;
    if (picked.every((other) => distance(colour.rgb, other.rgb) >= MIN_DISTANCE)) {
      picked.push({ n: 0, rgb: colour.rgb });
    }
  }

  for (const colour of colours) {
    let nearest = picked[0];
    for (const candidate of picked) {
      if (distance(colour.rgb, candidate.rgb) < distance(colour.rgb, nearest.rgb)) nearest = candidate;
    }
    nearest.n += colour.n;
  }

  return picked
    .sort((a, b) => b.n - a.n)
    .map((swatch) => ({ hex: toHex(swatch.rgb), share: swatch.n / pixelCount }));
}

function toHsl(hex: string): { h: number; s: number; l: number } {
  const value = parseInt(hex.slice(1), 16);
  const r = ((value >> 16) & 255) / 255;
  const g = ((value >> 8) & 255) / 255;
  const b = (value & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** The colour family a swatch belongs to, as offered by the colour filter. */
export function bucketOf(hex: string): ColorBucket {
  const { h, s, l } = toHsl(hex);
  if (l < 0.25) return 'dark';
  if (s < 0.15) return l < 0.5 ? 'dark' : 'light';
  if (l > 0.85 && s < 0.25) return 'light';
  if (h >= 345 || h < 15) return 'red';
  if (h < 40) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 160) return 'green';
  if (h < 190) return 'teal';
  if (h < 255) return 'blue';
  if (h < 290) return 'purple';
  return 'pink';
}

const DARK_INK = '#0a0d0c';
const LIGHT_INK = '#ffffff';

/** Relative luminance as defined by WCAG, 0 for black to 1 for white. */
function luminance(hex: string): number {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
}

/** The colour, dark or white, that stands out more on the given background. */
export function inkOn(background: string): typeof DARK_INK | typeof LIGHT_INK {
  const l = luminance(background);
  const againstWhite = 1.05 / (l + 0.05);
  const againstDark = (l + 0.05) / (luminance(DARK_INK) + 0.05);
  return againstDark >= againstWhite ? DARK_INK : LIGHT_INK;
}

/** Almost every wallpaper has some black or white in it, so those two must dominate to count. */
const NEUTRAL_MIN_SHARE = 0.5;

/**
 * The colour families a wallpaper is filed under: every family that covers at
 * least `minShare` of the image (half of it for dark and light), or the family
 * of the largest swatch if none does.
 */
export function bucketsOf(palette: Swatch[], minShare = 0.12): ColorBucket[] {
  if (palette.length === 0) return [];
  const shares = new Map<ColorBucket, number>();
  for (const swatch of palette) {
    const bucket = bucketOf(swatch.hex);
    shares.set(bucket, (shares.get(bucket) ?? 0) + swatch.share);
  }
  const prominent = [...shares]
    .filter(([bucket, share]) => share >= (bucket === 'dark' || bucket === 'light' ? NEUTRAL_MIN_SHARE : minShare))
    .map(([bucket]) => bucket);
  return prominent.length > 0 ? prominent : [bucketOf(palette[0].hex)];
}
