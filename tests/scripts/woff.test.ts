import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { woffToSfnt } from '../../scripts/lib/woff.ts';

const woff = readFileSync('node_modules/@fontsource/newsreader/files/newsreader-latin-400-normal.woff');

describe('woffToSfnt', () => {
  const sfnt = woffToSfnt(woff);

  it('produces a TrueType or OpenType file', () => {
    expect(['00010000', '4f54544f']).toContain(sfnt.subarray(0, 4).toString('hex'));
  });

  it('keeps every table', () => {
    expect(sfnt.readUInt16BE(4)).toBe(woff.readUInt16BE(12));
  });

  it('is as long as the WOFF header says the unpacked font is', () => {
    expect(sfnt.length).toBe(woff.readUInt32BE(16));
  });

  it('unpacks the tables, so the family name can be read', () => {
    // Names are stored as big-endian UTF-16.
    const name = Buffer.from('Newsreader', 'utf16le').swap16();
    expect(sfnt.includes(name)).toBe(true);
    expect(woff.includes(name)).toBe(false);
  });

  it('refuses a file that is not WOFF', () => {
    expect(() => woffToSfnt(Buffer.from('not a font at all, just some text'))).toThrow(/WOFF/);
  });
});
