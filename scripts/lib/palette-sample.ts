import sharp from 'sharp';

/**
 * Long edge of the sample. The palette thresholds in data/tagger.json were calibrated on exactly
 * this sampling (flattened on black, nearest-neighbour, sRGB), so the evaluation and every
 * later tagging step must go through sampleForPalette and nothing else.
 */
export const SAMPLE_EDGE = 256;

/** Packed r, g, b bytes of an image, ready for paletteCoverage. Takes a Buffer so libvips holds no file lock. */
export async function sampleForPalette(image: Buffer): Promise<Uint8Array> {
  const { data } = await sharp(image)
    .flatten({ background: '#000000' })
    // Nearest-neighbour: blending would invent colours that are in no palette.
    .resize(SAMPLE_EDGE, SAMPLE_EDGE, { fit: 'inside', kernel: 'nearest' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(data);
}
