// Builds everything the site needs from the originals in images/:
// thumbnails, previews and share images in public/m/, and the catalog in
// src/generated/catalog.json. Only new or changed images are processed.
//
//   node scripts/build-media.ts

import { validateCatalog } from '../src/lib/catalog.ts';
import { loadCatalog } from './lib/load.ts';
import { buildHomeOg, buildMedia, type MediaOptions } from './lib/media.ts';
import { scanImages } from './lib/scan.ts';

const options: MediaOptions = {
  imagesDir: 'images',
  outDir: 'public/m',
  cacheFile: '.cache/media.json',
  catalogOut: 'src/generated/catalog.json',
};

try {
  const started = Date.now();
  const [{ entries, tags }, files] = await Promise.all([loadCatalog(), scanImages(options.imagesDir)]);

  const issues = validateCatalog(entries, tags, files);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`${issue.rule.padEnd(18)} ${issue.file ?? '-'}  ${issue.message}`);
    throw new Error(`The catalog has ${issues.length} problem(s). Run "npm run validate" for details.`);
  }

  const { wallpapers, processed, cached } = await buildMedia(entries, options);
  await buildHomeOg(wallpapers, options);

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`media: ${wallpapers.length} wallpapers (${processed} processed, ${cached} cached) in ${seconds}s`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
