import { describe, expect, it } from 'vitest';
import { bucketOf, bucketsOf, paletteFromRgb } from '../../src/lib/colors.ts';

type Rgb = [number, number, number];

function pixels(...runs: [count: number, colour: Rgb][]): Uint8Array {
  return Uint8Array.from(runs.flatMap(([count, colour]) => Array.from({ length: count }, () => colour).flat()));
}

describe('paletteFromRgb', () => {
  it('returns one full-share swatch for a solid colour', () => {
    expect(paletteFromRgb(pixels([64, [255, 0, 0]]))).toEqual([{ hex: '#ff0000', share: 1 }]);
  });

  it('splits a half black, half white image evenly', () => {
    const palette = paletteFromRgb(pixels([32, [0, 0, 0]], [32, [255, 255, 255]]));
    expect(palette.map((s) => s.hex).sort()).toEqual(['#000000', '#ffffff']);
    expect(palette.map((s) => s.share)).toEqual([0.5, 0.5]);
  });

  it('puts the most common colour first', () => {
    const palette = paletteFromRgb(pixels([10, [0, 0, 255]], [30, [255, 0, 0]]));
    expect(palette.map((s) => s.hex)).toEqual(['#ff0000', '#0000ff']);
  });

  it('folds near-identical shades into one swatch', () => {
    const palette = paletteFromRgb(pixels([30, [10, 10, 10]], [10, [30, 30, 30]]));
    expect(palette).toHaveLength(1);
    expect(palette[0].share).toBe(1);
  });

  it('never returns more swatches than asked for', () => {
    const rgb = pixels(
      [1, [255, 0, 0]],
      [1, [0, 255, 0]],
      [1, [0, 0, 255]],
      [1, [255, 255, 0]],
      [1, [0, 255, 255]],
      [1, [255, 0, 255]],
    );
    expect(paletteFromRgb(rgb, 3)).toHaveLength(3);
  });

  it('returns nothing for an empty buffer', () => {
    expect(paletteFromRgb(new Uint8Array())).toEqual([]);
  });
});

describe('bucketOf', () => {
  it.each([
    ['#e5484d', 'red'],
    ['#f59e0b', 'orange'],
    ['#eab308', 'yellow'],
    ['#22c55e', 'green'],
    ['#2dd4bf', 'teal'],
    ['#3b82f6', 'blue'],
    ['#a855f7', 'purple'],
    ['#ec4899', 'pink'],
    ['#2e3440', 'dark'],
    ['#f4f4f5', 'light'],
  ] as const)('%s is %s', (hex, expected) => {
    expect(bucketOf(hex)).toBe(expected);
  });
});

describe('bucketsOf', () => {
  it('drops swatches under the minimum share', () => {
    const palette = [
      { hex: '#3b82f6', share: 0.9 },
      { hex: '#e5484d', share: 0.1 },
    ];
    expect(bucketsOf(palette)).toEqual(['blue']);
  });

  it('lists each bucket once', () => {
    const palette = [
      { hex: '#3b82f6', share: 0.5 },
      { hex: '#2563eb', share: 0.5 },
    ];
    expect(bucketsOf(palette)).toEqual(['blue']);
  });

  it('falls back to the largest swatch when none reaches the minimum', () => {
    const palette = [
      { hex: '#e5484d', share: 0.1 },
      { hex: '#3b82f6', share: 0.1 },
    ];
    expect(bucketsOf(palette)).toEqual(['red']);
  });

  it('files a wallpaper under dark or light only when that covers most of it', () => {
    const accent = [
      { hex: '#0a0d0c', share: 0.35 },
      { hex: '#3b82f6', share: 0.3 },
    ];
    const mostlyDark = [
      { hex: '#0a0d0c', share: 0.7 },
      { hex: '#3b82f6', share: 0.3 },
    ];
    expect(bucketsOf(accent)).toEqual(['blue']);
    expect(bucketsOf(mostlyDark)).toEqual(['dark', 'blue']);
  });

  it('returns nothing for an empty palette', () => {
    expect(bucketsOf([])).toEqual([]);
  });
});
