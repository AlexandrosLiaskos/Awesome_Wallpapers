// Checks data/wallpapers.yml and data/tags.yml against the files in images/, and the approved
// files of the indexed collections in data/sources/ (see validateApproved).
//
//   node scripts/validate.ts                      every rule for the whole collection
//   node scripts/validate.ts --new images/a.png   also apply the stricter rules for added files

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { validateApproved, validateCatalog } from '../src/lib/catalog.ts';
import { parseSources } from '../src/lib/sources.ts';
import { loadCatalog } from './lib/load.ts';
import { loadApproved } from './lib/originals.ts';
import { scanImages } from './lib/scan.ts';

const args = process.argv.slice(2);
const flag = args.indexOf('--new');
const newFiles = flag === -1 ? [] : args.slice(flag + 1).map((path) => basename(path));

try {
  const [{ entries, tags }, files, sourcesYaml] = await Promise.all([
    loadCatalog(),
    scanImages('images'),
    readFile('data/sources.yml', 'utf8'),
  ]);
  const sources = parseSources(sourcesYaml, tags.map((tag) => tag.slug));
  const collections = await Promise.all(
    sources.map(async (source) => ({ id: source.id, files: await loadApproved('data/sources', source.id) })),
  );
  const issues = [...validateCatalog(entries, tags, files, { newFiles }), ...validateApproved(entries, tags, collections)];

  if (issues.length === 0) {
    const approved = collections.reduce((sum, { files: list }) => sum + list.length, 0);
    console.log(`OK: ${entries.length} wallpapers, ${approved} approved from collections, ${tags.length} tags`);
  } else {
    for (const issue of issues) {
      console.error(`${issue.rule.padEnd(18)} ${issue.file ?? '-'}  ${issue.message}`);
    }
    console.error(`\n${issues.length} problem${issues.length === 1 ? '' : 's'} found.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
