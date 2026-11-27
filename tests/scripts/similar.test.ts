import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { looksIdentical, pictureDistance } from '../../scripts/lib/similar.ts';

const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();

// The merge compares the thumbnails the media step made of each copy, so the
// tests do too: 300 px high, WebP at quality 72.
const thumbnail = (image: Buffer) => sharp(image).resize({ height: 300 }).webp({ quality: 72 }).toBuffer();

/** A gradient with three shapes, in the colours given. */
function artwork(colours: string[]): string {
  const [from, to, circle, rect, triangle] = colours;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
    <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="0.3">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="1600" height="900" fill="url(#g)"/>
    <circle cx="380" cy="300" r="220" fill="${circle}"/>
    <rect x="950" y="480" width="480" height="320" fill="${rect}"/>
    <polygon points="100,860 720,600 300,890" fill="${triangle}"/>
  </svg>`;
}

/** One centred shape on a plain pink background, as many logo wallpapers are. */
function logo(shape: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
    <rect width="1600" height="900" fill="#f2b5d4"/>${shape}</svg>`;
}

describe('looksIdentical', () => {
  it('accepts the same image at half the size, saved as JPEG at quality 70', async () => {
    const original = await png(artwork(['#2e3440', '#5e81ac', '#bf616a', '#88c0d0', '#ebcb8b']));
    const copy = await sharp(original).resize(800, 450).jpeg({ quality: 70 }).toBuffer();
    const [a, b] = await Promise.all([thumbnail(original), thumbnail(copy)]);
    expect(await looksIdentical(a, b)).toBe(true);
    expect(await looksIdentical(b, a)).toBe(true);
  });

  it('rejects two different centred shapes on the same pink background', async () => {
    // Each covers about 8% of the picture: a circle of radius 191 and a triangle of 532 by 460.
    const circle = await thumbnail(await png(logo('<circle cx="800" cy="450" r="191" fill="#3b1f4a"/>')));
    const triangle = await thumbnail(await png(logo('<polygon points="800,195 1066,655 534,655" fill="#3b1f4a"/>')));
    expect(await looksIdentical(circle, triangle)).toBe(false);
  });

  it('rejects two different small marks on the same plain background, like Tux and Windows', async () => {
    // Each covers about 2% of the picture: a circle of radius 96 and a triangle of 266 by 216.
    const circle = await thumbnail(await png(logo('<circle cx="800" cy="450" r="96" fill="#3b1f4a"/>')));
    const triangle = await thumbnail(await png(logo('<polygon points="800,342 933,558 667,558" fill="#3b1f4a"/>')));
    expect(await looksIdentical(circle, triangle)).toBe(false);
  });

  it('rejects a recolouring: the same shapes in another palette', async () => {
    const nord = await thumbnail(await png(artwork(['#2e3440', '#5e81ac', '#bf616a', '#88c0d0', '#ebcb8b'])));
    const gruvbox = await thumbnail(await png(artwork(['#282828', '#458588', '#cc241d', '#689d6a', '#d79921'])));
    expect(await looksIdentical(nord, gruvbox)).toBe(false);
  });

  it('composes transparency onto the site background before comparing', async () => {
    const clear = await sharp({ create: { width: 64, height: 36, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const dark = await sharp({ create: { width: 64, height: 36, channels: 3, background: '#0a0d0c' } }).png().toBuffer();
    expect(await looksIdentical(clear, dark)).toBe(true);
  });

  it('rejects a recolouring whose every colour is shifted a little, as a Gruvbox and a Nord version on near-equal dark greys', async () => {
    // Every colour moved by (9, 9, 9), about 15.6 in RGB: no pixel is 32 apart, but all are.
    const nord = await thumbnail(await png(artwork(['#2e3440', '#5e81ac', '#bf616a', '#88c0d0', '#ebcb8b'])));
    const shifted = await thumbnail(await png(artwork(['#373d49', '#678ab5', '#c86a73', '#91c9d9', '#f4d494'])));
    const { mean, max } = await pictureDistance(nord, shifted);
    expect(max).toBeLessThanOrEqual(32);
    expect(mean).toBeGreaterThan(8);
    expect(await looksIdentical(nord, shifted)).toBe(false);
  });
});

// Plain 32×32 images, which the comparison takes as they are, so the distances are exact.
const GREY = { r: 100, g: 100, b: 100 };
const flat = (colour: { r: number; g: number; b: number }) =>
  sharp({ create: { width: 32, height: 32, channels: 3, background: colour } }).png().toBuffer();

/** A grey 32×32 image with one pixel, at (5, 7), moved by the given amounts. */
async function withOnePixel(dr: number, dg: number, db: number): Promise<Buffer> {
  const raw = Buffer.alloc(32 * 32 * 3, 100);
  const at = (7 * 32 + 5) * 3;
  raw[at] += dr;
  raw[at + 1] += dg;
  raw[at + 2] += db;
  return sharp(raw, { raw: { width: 32, height: 32, channels: 3 } }).png().toBuffer();
}

describe('the limits of looksIdentical', () => {
  it('accepts one pixel exactly 32 apart and rejects one just over', async () => {
    const grey = await flat(GREY);
    expect(await pictureDistance(grey, await withOnePixel(32, 0, 0))).toEqual({ mean: 32 / 1024, max: 32 });
    expect(await looksIdentical(grey, await withOnePixel(32, 0, 0))).toBe(true);
    // (32, 1, 0) is 32.02 apart.
    expect(await looksIdentical(grey, await withOnePixel(32, 1, 0))).toBe(false);
  });

  it('accepts every pixel exactly 8 apart and rejects every pixel just over', async () => {
    const grey = await flat(GREY);
    const eight = await flat({ r: 108, g: 100, b: 100 });
    expect(await pictureDistance(grey, eight)).toEqual({ mean: 8, max: 8 });
    expect(await looksIdentical(grey, eight)).toBe(true);
    // (8, 1, 0) is 8.06 apart.
    expect(await looksIdentical(grey, await flat({ r: 108, g: 101, b: 100 }))).toBe(false);
  });
});
