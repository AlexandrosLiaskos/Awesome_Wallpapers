import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { looksIdentical } from '../../scripts/lib/similar.ts';

const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();

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
    expect(await looksIdentical(original, copy)).toBe(true);
    expect(await looksIdentical(copy, original)).toBe(true);
  });

  it('rejects two different centred shapes on the same pink background', async () => {
    // Each covers about 8% of the picture: a circle of radius 191 and a triangle of 532 by 460.
    const circle = await png(logo('<circle cx="800" cy="450" r="191" fill="#3b1f4a"/>'));
    const triangle = await png(logo('<polygon points="800,195 1066,655 534,655" fill="#3b1f4a"/>'));
    expect(await looksIdentical(circle, triangle)).toBe(false);
  });

  it('rejects a recolouring: the same shapes in another palette', async () => {
    const nord = await png(artwork(['#2e3440', '#5e81ac', '#bf616a', '#88c0d0', '#ebcb8b']));
    const gruvbox = await png(artwork(['#282828', '#458588', '#cc241d', '#689d6a', '#d79921']));
    expect(await looksIdentical(nord, gruvbox)).toBe(false);
  });

  it('composes transparency onto the site background before comparing', async () => {
    const clear = await sharp({ create: { width: 64, height: 36, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const dark = await sharp({ create: { width: 64, height: 36, channels: 3, background: '#0a0d0c' } }).png().toBuffer();
    expect(await looksIdentical(clear, dark)).toBe(true);
  });
});
