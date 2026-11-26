// Checks data/wallpapers.yml and data/tags.yml against the files in images/.
//
//   node scripts/validate.ts                      every rule for the whole collection
//   node scripts/validate.ts --new images/a.png   also apply the stricter rules for added files

import { basename } from 'node:path';
import { validateCatalog } from '../src/lib/catalog.ts';
import { loadCatalog } from './lib/load.ts';
import { scanImages } from './lib/scan.ts';

const args = process.argv.slice(2);
const flag = args.indexOf('--new');
const newFiles = flag === -1 ? [] : args.slice(flag + 1).map((path) => basename(path));

try {
  const [{ entries, tags }, files] = await Promise.all([loadCatalog(), scanImages('images')]);
  const issues = validateCatalog(entries, tags, files, { newFiles });

  if (issues.length === 0) {
    console.log(`OK: ${entries.length} wallpapers, ${tags.length} tags`);
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
