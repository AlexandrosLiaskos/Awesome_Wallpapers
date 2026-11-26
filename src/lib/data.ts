// The data every page is rendered from. `catalog.json` is written by
// `npm run media`; `tags.yml` is the hand-edited vocabulary and `sources.yml`
// the collections that are indexed.

import sourcesYaml from '../../data/sources.yml?raw';
import tagsYaml from '../../data/tags.yml?raw';
import catalog from '../generated/catalog.json';
import { parseTags } from './catalog.ts';
import { attributionOf } from './indexed.ts';
import { SITE } from './site.ts';
import { tagsWithCounts } from './site-data.ts';
import { parseSources } from './sources.ts';
import type { Attribution, Wallpaper } from './types.ts';

export const wallpapers = catalog as Wallpaper[];
export const tags = parseTags(tagsYaml);
export const usedTags = tagsWithCounts(wallpapers, tags);
export const sources = parseSources(sourcesYaml, tags.map((tag) => tag.slug));

const collections = new Map(sources.map((source) => [source.id, attributionOf(source)]));

/**
 * A collection's name and repository by its id, for "Also in" credits. `own`
 * is this repository's copy of a file, collected from the default source.
 */
export function collectionOf(id: string): Attribution | undefined {
  return id === 'own' ? SITE.defaultSource : collections.get(id);
}

const labels = new Map(tags.map((tag) => [tag.slug, tag.label]));

/** Tag slug to label, as the browser gets it in the compact index. */
export const tagLabels: Record<string, string> = Object.fromEntries(labels);

export function tagLabel(slug: string): string {
  return labels.get(slug) ?? slug;
}
