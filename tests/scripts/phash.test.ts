import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { dHash } from '../../scripts/lib/phash.ts';
import { hamming } from '../../src/lib/dedup.ts';

// Nothing in it mirrors left to right: a gradient, and shapes off the centre line.
// The shapes let the gradient through, so no area is flat enough for JPEG noise
// to decide which of two neighbours is brighter.
const ASYMMETRIC = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="0.3">
      <stop offset="0" stop-color="#1b2b34"/>
      <stop offset="1" stop-color="#e8c07a"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#g)"/>
  <circle cx="380" cy="300" r="220" fill="#c0392b" fill-opacity="0.6"/>
  <rect x="950" y="480" width="480" height="320" fill="#2980b9" fill-opacity="0.6"/>
  <polygon points="100,860 720,600 300,890" fill="#f1c40f" fill-opacity="0.6"/>
</svg>`;

let original: Buffer;

beforeAll(async () => {
  original = await sharp(Buffer.from(ASYMMETRIC)).png().toBuffer();
});

describe('dHash', () => {
  it('gives 16 hex digits', async () => {
    expect(await dHash(original)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('barely changes when the image is downscaled by half', async () => {
    const half = await sharp(original).resize(800, 450).jpeg({ quality: 85 }).toBuffer();
    expect(hamming(await dHash(original), await dHash(half))).toBeLessThanOrEqual(2);
  });

  it('changes a lot when the image is flipped left to right', async () => {
    const flipped = await sharp(original).flop().png().toBuffer();
    expect(hamming(await dHash(original), await dHash(flipped))).toBeGreaterThan(10);
  });

  it('reads only the first frame of an animation', async () => {
    const second = await sharp(original).flop().png().toBuffer();
    const animation = await sharp([original, second], { join: { animated: true } }).gif().toBuffer();
    const still = await sharp(original).gif().toBuffer();
    expect(hamming(await dHash(animation), await dHash(still))).toBeLessThanOrEqual(2);
  });
});
