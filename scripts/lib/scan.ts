import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { ALLOWED_EXTENSIONS } from '../../src/lib/catalog.ts';
import type { FileFacts } from '../../src/lib/types.ts';

const CONCURRENCY = 8;

/** Runs `task` over `items`, a few at a time, keeping the order of the results. */
export async function mapLimit<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function factsOf(dir: string, file: string): Promise<FileFacts> {
  const bytes = await readFile(join(dir, file));
  const sha1 = createHash('sha1').update(bytes).digest('hex');
  const extension = file.slice(file.lastIndexOf('.') + 1).toLowerCase();
  // Anything that is not an image is still reported, so validation can name it.
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return { file, bytes: bytes.length, width: 0, height: 0, sha1 };
  }
  try {
    // An animation is measured by its first frame; EXIF rotation is applied.
    const metadata = await sharp(bytes).metadata();
    const { width, height } = metadata.autoOrient ?? metadata;
    return { file, bytes: bytes.length, width: width ?? 0, height: height ?? 0, sha1 };
  } catch (error) {
    throw new Error(`images/${file} cannot be read as an image: ${(error as Error).message}`);
  }
}

/** Measures every file in the images directory, in name order ignoring case. */
export async function scanImages(dir: string): Promise<FileFacts[]> {
  const listing = await readdir(dir, { withFileTypes: true });
  const files = listing
    .filter((item) => item.isFile())
    .map((item) => item.name)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b));
  return mapLimit(files, CONCURRENCY, (file) => factsOf(dir, file));
}
