// The content check behind duplicate merging. The 64-bit fingerprint only
// shortlists pairs: it does not see a small logo on a plain background. This
// compares the two pictures themselves, small enough to be quick.

import sharp from 'sharp';

const EDGE = 32;
/** The site background, as in media.ts: transparent pixels are composed onto it there too. */
const BACKGROUND = '#0a0d0c';
/**
 * Every pixel must be this close in RGB. A small logo on a plain background
 * covers too few pixels for a percentile to notice, so no pixel may differ
 * more. The thumbnails of our own wallpapers and of their half-size JPEG
 * copies differ by at most 19.2.
 */
const MAX_PIXEL_DISTANCE = 32;
/**
 * And the pixels must be this close on average. A recolouring for another
 * theme whose background is a near-equal dark grey (Gruvbox #3c3836 and Nord
 * #2e3440 are 18 apart) shifts every pixel a little, which the largest
 * distance lets through: the Gruvbox and Nord Great Wave differ by 19.6 at
 * most but by 16.6 on average. The 23 true copies among the pilot collections
 * differ by 3.8 on average at most, 0.0 in 21 of them.
 */
const MAX_MEAN_DISTANCE = 8;

async function reduce(image: Buffer): Promise<Uint8Array> {
  const { data, info } = await sharp(image, { pages: 1 })
    .rotate()
    .flatten({ background: BACKGROUND })
    .resize(EDGE, EDGE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // A greyscale image stays one channel; spread it to three so both sides compare alike.
  if (info.channels >= 3) return new Uint8Array(data);
  const rgb = new Uint8Array(EDGE * EDGE * 3);
  for (let i = 0; i < EDGE * EDGE; i++) rgb.fill(data[i * info.channels], i * 3, i * 3 + 3);
  return rgb;
}

/** How far apart two images are once both are reduced to 32×32 RGB: the mean and the largest Euclidean RGB distance of a pixel. */
export async function pictureDistance(a: Buffer, b: Buffer): Promise<{ mean: number; max: number }> {
  const [x, y] = await Promise.all([reduce(a), reduce(b)]);
  let sum = 0;
  let max = 0;
  for (let j = 0; j < EDGE * EDGE * 3; j += 3) {
    const distance = Math.hypot(x[j] - y[j], x[j + 1] - y[j + 1], x[j + 2] - y[j + 2]);
    sum += distance;
    if (distance > max) max = distance;
  }
  return { mean: sum / (EDGE * EDGE), max };
}

/**
 * Whether two images show the same picture: both reduced to 32×32 RGB, every
 * pixel at most 32 apart (Euclidean RGB distance) and the pixels at most 8
 * apart on average. Meant for the thumbnails of the media step: a full-size
 * original compared directly with a JPEG copy can differ by a little more where
 * a thin, saturated shape meets a dark one (34 in a test image whose thumbnails
 * differ by 7).
 */
export async function looksIdentical(a: Buffer, b: Buffer): Promise<boolean> {
  const { mean, max } = await pictureDistance(a, b);
  return max <= MAX_PIXEL_DISTANCE && mean <= MAX_MEAN_DISTANCE;
}
