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

const FROST_AND_AURORA = PALETTES.nord.slice(7);

describe('paletteCoverage', () => {
  it('is 1 for an image made only of Nord frost and aurora colours, and low for Gruvbox', () => {
    const nordImage = image(FROST_AND_AURORA);
    expect(paletteCoverage(nordImage, PALETTES.nord)).toBe(1);
    expect(paletteCoverage(nordImage, PALETTES.gruvbox)).toBeLessThan(0.2);
  });

  it('scores 0 for every palette on a dark grey image', () => {
    const grey = image(['#1a1a1a', '#2b2b2b', '#3c3c3c', '#808080']);
    for (const palette of Object.values(PALETTES)) expect(paletteCoverage(grey, palette)).toBe(0);
  });

  it('scores 0 when under 5% of the pixels are chromatic', () => {
    const mostlyGrey = new Uint8Array([...image(['#2a2a2a'], 97), ...image(['#88c0d0'], 3)]);
    expect(paletteCoverage(mostlyGrey, PALETTES.nord)).toBe(0);
    const enough = new Uint8Array([...image(['#2a2a2a'], 95), ...image(['#88c0d0'], 5)]);
    expect(paletteCoverage(enough, PALETTES.nord)).toBe(1);
  });

  it('ignores grey pixels instead of counting them as hits or misses', () => {
    const mix = new Uint8Array([...image(['#2a2a2a'], 50), ...image(['#88c0d0'], 50)]);
    expect(paletteCoverage(mix, PALETTES.nord)).toBe(1);
  });

  it('counts a colour a few units off as a match only inside the distance', () => {
    const near = image(['#88c0d0']).map((value) => value + 2);
    expect(paletteCoverage(near, PALETTES.nord, 6)).toBe(1);
    expect(paletteCoverage(near, PALETTES.nord, 0.5)).toBe(0);
    expect(paletteCoverage(image(['#ff00ff']), PALETTES.nord)).toBe(0);
  });

  it('is 0 for an empty image', () => {
    expect(paletteCoverage(new Uint8Array(0), PALETTES.nord)).toBe(0);
  });
});

describe('paletteTags', () => {
  const setting = { deltaE: 6, threshold: 0.5 };

  it('tags an image with the palette whose threshold it reaches', () => {
    expect(paletteTags(image(FROST_AND_AURORA), { nord: { deltaE: 6, threshold: 1 }, gruvbox: setting })).toEqual(['nord']);
  });

  it('returns nothing when no coverage reaches its threshold', () => {
    expect(paletteTags(image(['#ff00ff']), { nord: setting, gruvbox: setting })).toEqual([]);
  });

  it('never assigns a palette whose setting is null', () => {
    expect(paletteTags(image(FROST_AND_AURORA), { nord: null })).toEqual([]);
  });

  it('puts the palette with the highest coverage first and keeps at most two', () => {
    // Three quarters Gruvbox colours, one quarter a Nord colour.
    const mix = new Uint8Array([...image(['#fb4934', '#b8bb26', '#fabd2f'], 16), ...image(['#8fbcbb'], 16)]);
    expect(paletteTags(mix, { nord: { deltaE: 6, threshold: 0.2 }, gruvbox: { deltaE: 6, threshold: 0.2 } })).toEqual(['gruvbox', 'nord']);

    const all = Object.fromEntries(Object.keys(PALETTES).map((k) => [k, { deltaE: 12, threshold: 0 }]));
    expect(paletteTags(image(FROST_AND_AURORA), all)).toHaveLength(2);
  });
});
