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

/**
 * The model the subject probes and thresholds were fitted on, pinned to one commit of its files on
 * the Hugging Face Hub, so a new upload there cannot change the tags. npm run eval-tagger writes it
 * into data/tagger-weights.json and sync refuses weights fitted on anything else; changing any part
 * means running the evaluation again.
 */
export const CLIP = {
  id: 'Xenova/clip-vit-base-patch32',
  revision: '6b7c523703ae26e39be4b03774966f8571c7f523',
  dtype: 'q8',
} as const;

// Downloaded once on first use and kept out of git (.cache/ is ignored).
const CACHE_DIR = fileURLToPath(new URL('../../.cache/models', import.meta.url));

/** Rows of a [rows, width] tensor as separate vectors, each scaled to unit length. */
function unitRows(data: Float32Array, count: number): Float32Array[] {
  const width = data.length / count;
  return Array.from({ length: count }, (_, row) => {
    const vector = data.slice(row * width, (row + 1) * width);
    const length = Math.hypot(...vector);
    return vector.map((value) => value / length);
  });
}

/**
 * Loads CLIP (the files and quantization named in CLIP) for embedding images and texts into the
 * same space, where their cosine similarity says how well a text describes an image. Embeddings
 * come back at unit length, which is what the subject probes in data/tagger-weights.json were
 * trained on.
 */
export async function loadClip(): Promise<{ image(buffer: Buffer): Promise<Float32Array>; texts(prompts: string[]): Promise<Float32Array[]> }> {
  env.cacheDir = CACHE_DIR;
  const files = { revision: CLIP.revision };
  const options = { ...files, dtype: CLIP.dtype };
  const [tokenizer, processor, textModel, visionModel] = await Promise.all([
    AutoTokenizer.from_pretrained(CLIP.id, files),
    AutoProcessor.from_pretrained(CLIP.id, files),
    CLIPTextModelWithProjection.from_pretrained(CLIP.id, options),
    CLIPVisionModelWithProjection.from_pretrained(CLIP.id, options),
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
      return unitRows(image_embeds.data as Float32Array, 1)[0];
    },
    async texts(prompts) {
      const { text_embeds } = await textModel(tokenizer(prompts, { padding: true, truncation: true }));
      return unitRows(text_embeds.data as Float32Array, prompts.length);
    },
  };
}
