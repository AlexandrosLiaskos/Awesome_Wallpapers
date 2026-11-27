// Builds everything the site needs: thumbnails, previews and share images in
// public/m/ for the wallpapers in images/ and for the approved files of the
// indexed collections, and the catalog in src/generated/catalog.json. Only new
// or changed images are processed; an indexed original is downloaded only then,
// and never kept.
//
//   node scripts/build-media.ts
//
// GITHUB_TOKEN, when set, is used to list the collections.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { slugOf, validateCatalog } from '../src/lib/catalog.ts';
import { mergeDuplicates } from '../src/lib/dedup.ts';
import { toWallpaper } from '../src/lib/indexed.ts';
import { parseSources } from '../src/lib/sources.ts';
import { listTree } from './lib/github.ts';
import { loadCatalog } from './lib/load.ts';
import {
  buildHomeOg,
  buildMedia,
  catalogOrder,
  ownItem,
  ownWallpaper,
  thumbnailsMatch,
  type MediaOptions,
} from './lib/media.ts';
import { availableOriginals, indexedItem, loadApproved, withoutSlugClashes } from './lib/originals.ts';
import { scanImages } from './lib/scan.ts';

const IMAGES_DIR = 'images';
const SOURCES_FILE = 'data/sources.yml';
const APPROVED_DIR = 'data/sources';
const CATALOG_OUT = 'src/generated/catalog.json';
const options: MediaOptions = { outDir: 'public/m', cacheFile: '.cache/media.json' };

try {
  const started = Date.now();
  const [{ entries, tags }, files, sourcesYaml] = await Promise.all([
    loadCatalog(),
    scanImages(IMAGES_DIR),
    readFile(SOURCES_FILE, 'utf8'),
  ]);

  const issues = validateCatalog(entries, tags, files);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`${issue.rule.padEnd(18)} ${issue.file ?? '-'}  ${issue.message}`);
    throw new Error(`The catalog has ${issues.length} problem(s). Run "npm run validate" for details.`);
  }

  const sources = parseSources(sourcesYaml, tags.map((tag) => tag.slug));
  const token = process.env.GITHUB_TOKEN || undefined;
  const warn = (message: string) => console.warn(message);
  const available = await availableOriginals(sources, {
    approved: (source) => loadApproved(APPROVED_DIR, source.id),
    list: (source) => listTree(source, { token }),
    warn,
  });
  // Own slugs were checked by validateCatalog above; a clash with an indexed file only costs that file.
  const indexed = withoutSlugClashes(entries.map(slugOf), available, warn);

  // Validation made sure every entry's file is there.
  const sha1 = new Map(files.map((facts) => [facts.file, facts.sha1]));
  const own = entries.map((entry) => ({ entry, item: ownItem(entry, IMAGES_DIR, sha1.get(entry.file)!) }));
  const remote = indexed.map(({ source, file }) => ({ source, file, item: indexedItem(source, file) }));
  const { derived, failed, processed, cached } = await buildMedia(
    [...own.map(({ item }) => item), ...remote.map(({ item }) => item)],
    options,
  );

  // An own file must build; an indexed one that cannot be fetched waits for the next build.
  for (const { item, error } of failed) {
    const copy = remote.find((candidate) => candidate.item === item);
    if (copy) {
      console.warn(`${copy.source.name}: ${copy.file.path} is left out of this build (${error.message})`);
    } else {
      const { entry } = own.find((candidate) => candidate.item === item)!;
      throw new Error(`images/${entry.file} could not be processed: ${error.message}`);
    }
  }

  const list = [
    ...own.map(({ entry, item }) => ownWallpaper(entry, derived.get(item.key)!)),
    ...remote.filter(({ item }) => derived.has(item.key)).map(({ source, file }) => toWallpaper(source, file)),
  ];
  const wallpapers = catalogOrder(await mergeDuplicates(list, thumbnailsMatch(options.outDir)));
  await mkdir(dirname(CATALOG_OUT), { recursive: true });
  await writeFile(CATALOG_OUT, JSON.stringify(wallpapers, null, 1));
  await buildHomeOg(wallpapers, options);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const fromCollections = wallpapers.filter((w) => w.sourceId !== 'own').length;
  const leftOut = failed.length > 0 ? `, ${failed.length} left out` : '';
  console.log(
    `media: ${wallpapers.length} wallpapers, ${fromCollections} from collections (${processed} processed, ${cached} cached${leftOut}) in ${seconds}s`,
  );
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
