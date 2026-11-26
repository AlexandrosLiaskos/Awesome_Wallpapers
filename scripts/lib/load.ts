import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEntries, parseTags } from '../../src/lib/catalog.ts';
import type { Entry, Tag } from '../../src/lib/types.ts';

/** Reads the two hand-edited data files. */
export async function loadCatalog(dataDir = 'data'): Promise<{ entries: Entry[]; tags: Tag[] }> {
  const [wallpapers, tags] = await Promise.all([
    readFile(join(dataDir, 'wallpapers.yml'), 'utf8'),
    readFile(join(dataDir, 'tags.yml'), 'utf8'),
  ]);
  return { entries: parseEntries(wallpapers), tags: parseTags(tags) };
}
