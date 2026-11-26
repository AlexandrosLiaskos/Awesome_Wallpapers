// A perceptual fingerprint of an image, for finding the same image in two
// collections even when one copy is smaller or saved in another format.

import sharp, { type Sharp } from 'sharp';

// 9 columns give 8 left-to-right comparisons per row; 8 rows give 64 bits.
const COLUMNS = 9;
const ROWS = 8;
/** The site background, as in media.ts: transparent pixels are composed onto it there too. */
const BACKGROUND = '#0a0d0c';

/**
 * The difference hash of a still frame: the frame reduced to 9×8 greys, one bit
 * per pair of neighbours in a row (1 when the left one is brighter), as 16 hex
 * digits. The media step calls this with the frame it already decoded.
 */
export async function dHashOfFrame(frame: Sharp): Promise<string> {
  const { data, info } = await frame
    .resize(COLUMNS, ROWS, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { channels } = info;
  const grey = (x: number, y: number) => {
    const i = (y * COLUMNS + x) * channels;
    return channels >= 3 ? 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] : data[i];
  };

  let hex = '';
  for (let y = 0; y < ROWS; y++) {
    let row = 0;
    for (let x = 0; x < COLUMNS - 1; x++) row = (row << 1) | (grey(x, y) > grey(x + 1, y) ? 1 : 0);
    hex += row.toString(16).padStart(2, '0');
  }
  return hex;
}

/** The difference hash of an image file: its first frame, upright, on the site background. */
export async function dHash(image: Buffer): Promise<string> {
  // Decoded in full before the reduction, as in the media step, so both give the same hash.
  const { data, info } = await sharp(image, { pages: 1 })
    .rotate()
    .flatten({ background: BACKGROUND })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return dHashOfFrame(sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }));
}
