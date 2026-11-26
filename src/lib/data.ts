// The data every page is rendered from. `catalog.json` is written by
// `npm run media`; `tags.yml` is the hand-edited vocabulary.

import tagsYaml from '../../data/tags.yml?raw';
import catalog from '../generated/catalog.json';
import { parseTags } from './catalog.ts';
import { tagsWithCounts } from './site-data.ts';
import type { Wallpaper } from './types.ts';

export const wallpapers = catalog as Wallpaper[];
export const tags = parseTags(tagsYaml);
export const usedTags = tagsWithCounts(wallpapers, tags);

const labels = new Map(tags.map((tag) => [tag.slug, tag.label]));

/** Tag slug to label, as the browser gets it in the compact index. */
export const tagLabels: Record<string, string> = Object.fromEntries(labels);

export function tagLabel(slug: string): string {
  return labels.get(slug) ?? slug;
}
