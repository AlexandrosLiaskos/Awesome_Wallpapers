import { describe, expect, it } from 'vitest';
import { formatBytes, numberInCollection } from '../../src/lib/format.ts';

describe('formatBytes', () => {
  it.each([
    [72_000, '70 KB'],
    [1_048_576, '1.00 MB'],
    [1_971_322, '1.88 MB'],
    [15_842_713, '15.1 MB'],
  ])('writes %i bytes as %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('numberInCollection', () => {
  it('pads the position to the width of the total', () => {
    expect(numberInCollection(13, 346)).toBe('No. 014 / 346');
    expect(numberInCollection(0, 9)).toBe('No. 1 / 9');
  });
});
