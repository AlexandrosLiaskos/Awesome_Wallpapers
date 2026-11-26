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

/**
 * Whether two images show the same picture: both reduced to 32×32 RGB, and
 * every pixel at most 32 apart (Euclidean RGB distance). Meant for the
 * thumbnails of the media step: a full-size original compared directly with a
 * JPEG copy can differ by a little more where a thin, saturated shape meets a
 * dark one (34 in a test image whose thumbnails differ by 7).
 */
export async function looksIdentical(a: Buffer, b: Buffer): Promise<boolean> {
  const [x, y] = await Promise.all([reduce(a), reduce(b)]);
  for (let j = 0; j < EDGE * EDGE * 3; j += 3) {
    if (Math.hypot(x[j] - y[j], x[j + 1] - y[j + 1], x[j + 2] - y[j + 2]) > MAX_PIXEL_DISTANCE) return false;
  }
  return true;
}
