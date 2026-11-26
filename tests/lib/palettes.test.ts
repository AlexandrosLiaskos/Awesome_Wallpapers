import { describe, expect, it } from 'vitest';
import { PALETTES, paletteCoverage, paletteTags, rgbToLab } from '../../src/lib/palettes.ts';

function hexRgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** An image made of equal runs of the given hex colours. */
function image(hexes: string[], pixelsEach = 16): Uint8Array {
  return Uint8Array.from(hexes.flatMap((hex) => Array.from({ length: pixelsEach }, () => hexRgb(hex)).flat()));
}

describe('rgbToLab', () => {
  it('puts black at L 0 and white at L 100', () => {
    expect(rgbToLab(0, 0, 0)[0]).toBeCloseTo(0, 1);
    const [l, a, b] = rgbToLab(255, 255, 255);
    expect(l).toBeCloseTo(100, 1);
    expect(a).toBeCloseTo(0, 1);
    expect(b).toBeCloseTo(0, 1);
  });

  it('matches the known value for sRGB red', () => {
    const [l, a, b] = rgbToLab(255, 0, 0);
    expect(l).toBeCloseTo(53.24, 1);
    expect(a).toBeCloseTo(80.09, 1);
    expect(b).toBeCloseTo(67.2, 1);
  });
});

describe('PALETTES', () => {
  it('lists the six palettes with valid hex colours', () => {
    expect(Object.keys(PALETTES).sort()).toEqual(['catppuccin', 'everforest', 'gruvbox', 'nord', 'rose-pine', 'tokyo-night']);
    for (const colours of Object.values(PALETTES)) {
      expect(colours.length).toBeGreaterThanOrEqual(16);
      for (const hex of colours) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('paletteCoverage', () => {
  const nordImage = image(PALETTES.nord);

  it('is 1 for an image made only of the palette colours', () => {
    expect(paletteCoverage(nordImage, PALETTES.nord)).toBe(1);
  });

  it('is low for the same image against an unrelated palette', () => {
    expect(paletteCoverage(nordImage, PALETTES.gruvbox)).toBeLessThan(0.2);
  });

  it('counts a colour a few units off as a match but a far one as a miss', () => {
    const near = image(['#2e3440']).map((value) => value + 2);
    expect(paletteCoverage(near, PALETTES.nord)).toBe(1);
    expect(paletteCoverage(image(['#ff00ff']), PALETTES.nord)).toBe(0);
  });

  it('is 0 for an empty image', () => {
    expect(paletteCoverage(new Uint8Array(0), PALETTES.nord)).toBe(0);
  });
});

describe('paletteTags', () => {
  const thresholds = { nord: 0.5, gruvbox: 0.5, catppuccin: 0.5, 'tokyo-night': 0.5, everforest: 0.5, 'rose-pine': 0.5 };

  it('tags an image with the palette whose threshold it reaches', () => {
    // Nord's blues sit close to some Catppuccin and Rosé Pine colours, so only nord is given a threshold here.
    expect(paletteTags(image(PALETTES.nord), { nord: 1, gruvbox: 0.5 })).toEqual(['nord']);
  });

  it('returns nothing when no coverage reaches its threshold', () => {
    expect(paletteTags(image(['#ff00ff']), thresholds)).toEqual([]);
  });

  it('never assigns a palette whose threshold is null', () => {
    expect(paletteTags(image(PALETTES.nord), { nord: null })).toEqual([]);
  });

  it('puts the palette with the highest coverage first and keeps at most two', () => {

    // Three quarters Gruvbox colours, one quarter a Nord colour.
    const mix = new Uint8Array([...image(['#fb4934', '#b8bb26', '#fabd2f'], 16), ...image(['#8fbcbb'], 16)]);
    const tags = paletteTags(mix, { ...thresholds, nord: 0.2, gruvbox: 0.2 });
    expect(tags).toEqual(['gruvbox', 'nord']);

    const everything = paletteTags(image(PALETTES.nord), Object.fromEntries(Object.keys(thresholds).map((k) => [k, 0])));
    expect(everything).toHaveLength(2);
    expect(everything[0]).toBe('nord');
  });
});
