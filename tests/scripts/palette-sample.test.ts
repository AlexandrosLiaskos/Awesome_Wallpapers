import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SAMPLE_EDGE, sampleForPalette } from '../../scripts/lib/palette-sample.ts';

async function twoColours(width: number, height: number, alpha = 1): Promise<Buffer> {
  const half = Buffer.alloc((width * height * 4) / 2);
  const left = Buffer.alloc(half.length);
  for (let i = 0; i < half.length; i += 4) {
    left.set([136, 192, 208, Math.round(255 * alpha)], i);
    half.set([191, 97, 106, Math.round(255 * alpha)], i);
  }
  // Left half blue, right half red, as one raw RGBA frame built row by row.
  const frame = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    left.copy(frame, y * width * 4, 0, (width / 2) * 4);
    half.copy(frame, y * width * 4 + (width / 2) * 4, 0, (width / 2) * 4);
  }
  return sharp(frame, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

describe('sampleForPalette', () => {
  it('downsizes a 512x256 image to 256x128 and keeps both colours exact', async () => {
    const rgb = await sampleForPalette(await twoColours(512, 256));
    expect(rgb.length).toBe(256 * 128 * 3);
    expect(SAMPLE_EDGE).toBe(256);
    const colours = new Set<string>();
    for (let i = 0; i < rgb.length; i += 3) colours.add(`${rgb[i]},${rgb[i + 1]},${rgb[i + 2]}`);
    expect([...colours].sort()).toEqual(['136,192,208', '191,97,106']);
  });

  it('flattens transparency onto black', async () => {
    const rgb = await sampleForPalette(await twoColours(512, 256, 0));
    expect(new Set(rgb)).toEqual(new Set([0]));
  });
});
