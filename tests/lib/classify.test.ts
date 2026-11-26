import { describe, expect, it } from 'vitest';
import { aspectLabel, formatOf, shapeOf, sizeClass } from '../../src/lib/classify.ts';

describe('sizeClass', () => {
  it.each([
    [3840, 2160, '4k'],
    [2160, 3840, '4k'],
    [2560, 1440, 'qhd'],
    [1920, 1080, 'fhd'],
    [1600, 900, 'hd'],
  ] as const)('%i x %i is %s', (w, h, expected) => {
    expect(sizeClass(w, h)).toBe(expected);
  });
});

describe('shapeOf', () => {
  it.each([
    [1080, 2340, 'phone'],
    [5160, 2160, 'ultrawide'],
    [2048, 576, 'ultrawide'],
    [3840, 1920, 'ultrawide'],
    [1920, 1080, 'desktop'],
  ] as const)('%i x %i is %s', (w, h, expected) => {
    expect(shapeOf(w, h)).toBe(expected);
  });
});

describe('aspectLabel', () => {
  it.each([
    [1920, 1080, '16:9'],
    [2560, 1600, '16:10'],
    [3440, 1440, '21:9'],
    [5120, 1440, '32:9'],
    [1080, 2340, '9:19.5'],
    [2458, 1260, '1.95:1'],
  ] as const)('%i x %i is %s', (w, h, expected) => {
    expect(aspectLabel(w, h)).toBe(expected);
  });

  it('writes an unnamed portrait ratio as 1 to something', () => {
    expect(aspectLabel(1000, 1700)).toBe('1:1.70');
  });
});

describe('formatOf', () => {
  it('reports jpeg as JPG', () => {
    expect(formatOf('x.jpeg')).toBe('JPG');
  });

  it('ignores case', () => {
    expect(formatOf('x.PNG')).toBe('PNG');
  });
});
