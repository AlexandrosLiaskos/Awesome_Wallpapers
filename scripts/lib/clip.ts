import { fileURLToPath } from 'node:url';
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from '@huggingface/transformers';
import sharp from 'sharp';

/** The subject thresholds in data/tagger.json were calibrated on this model; changing it means running npm run eval-tagger again. */
export const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';

// Downloaded once on first use and kept out of git (.cache/ is ignored).
const CACHE_DIR = fileURLToPath(new URL('../../.cache/models', import.meta.url));

/** Rows of a [rows, width] tensor as separate vectors. */
function rows(data: Float32Array, count: number): Float32Array[] {
  const width = data.length / count;
  return Array.from({ length: count }, (_, row) => data.slice(row * width, (row + 1) * width));
}

/**
 * Loads CLIP (quantized) for embedding images and texts into the same space, where their cosine
 * similarity says how well a text describes an image.
 */
export async function loadClip(): Promise<{ image(buffer: Buffer): Promise<Float32Array>; texts(prompts: string[]): Promise<Float32Array[]> }> {
  env.cacheDir = CACHE_DIR;
  const options = { dtype: 'q8' } as const;
  const [tokenizer, processor, textModel, visionModel] = await Promise.all([
    AutoTokenizer.from_pretrained(CLIP_MODEL),
    AutoProcessor.from_pretrained(CLIP_MODEL),
    CLIPTextModelWithProjection.from_pretrained(CLIP_MODEL, options),
    CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, options),
  ]);

  return {
    // Takes a Buffer and decodes it with sharp so that libvips holds no lock on the file.
    async image(buffer) {
      const { data, info } = await sharp(buffer)
        .flatten({ background: '#000000' })
        .removeAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true });
      const image = new RawImage(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, 3);
      const { image_embeds } = await visionModel(await processor(image));
      return rows(image_embeds.data as Float32Array, 1)[0];
    },
    async texts(prompts) {
      const { text_embeds } = await textModel(tokenizer(prompts, { padding: true, truncation: true }));
      return rows(text_embeds.data as Float32Array, prompts.length);
    },
  };
}
