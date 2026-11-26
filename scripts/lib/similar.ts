// The content check behind duplicate merging. The 64-bit fingerprint only
// shortlists pairs: it does not see a small logo on a plain background. This
// compares the two pictures themselves, small enough to be quick.

import sharp from 'sharp';

const EDGE = 32;
/** The site background, as in media.ts: transparent pixels are composed onto it there too. */
const BACKGROUND = '#0a0d0c';
/** Most pixels must be this close in RGB; a few may differ (compression, a resampled edge). */
const MAX_DISTANCE = 24;
const PERCENTILE = 0.95;

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
 * Whether two images show the same picture: both reduced to 32×32 RGB, and at
 * least 95% of the pixels at most 24 apart (Euclidean RGB distance).
 */
export async function looksIdentical(a: Buffer, b: Buffer): Promise<boolean> {
  const [x, y] = await Promise.all([reduce(a), reduce(b)]);
  const distances = new Float64Array(EDGE * EDGE);
  for (let i = 0; i < distances.length; i++) {
    const j = i * 3;
    distances[i] = Math.hypot(x[j] - y[j], x[j + 1] - y[j + 1], x[j + 2] - y[j + 2]);
  }
  distances.sort();
  // Nearest rank: the smallest distance that at least 95% of the pixels do not exceed.
  return distances[Math.ceil(PERCENTILE * distances.length) - 1] <= MAX_DISTANCE;
}
