// The data every page is rendered from. `catalog.json` is written by
// `npm run media`; `tags.yml` is the hand-edited vocabulary and `sources.yml`
// the collections that are indexed.

import sourcesYaml from '../../data/sources.yml?raw';
import tagsYaml from '../../data/tags.yml?raw';
import catalog from '../generated/catalog.json';
import { parseTags } from './catalog.ts';
import { attributionOf } from './indexed.ts';
import { SITE, url } from './site.ts';
import { creditedCollections, listedCollections, tagsWithCounts } from './site-data.ts';
import { parseSources } from './sources.ts';
import type { Attribution, Wallpaper } from './types.ts';

export const wallpapers = catalog as Wallpaper[];
export const tags = parseTags(tagsYaml);
export const usedTags = tagsWithCounts(wallpapers, tags);
export const sources = parseSources(sourcesYaml, tags.map((tag) => tag.slug));

const credits = new Map(sources.map((source) => [source.id, attributionOf(source)]));

/**
 * A collection's name and repository by its id, for "Also in" credits. Only
 * indexed collections are listed there: a group with an own wallpaper keeps
 * the own entry, so `own` never needs a name here.
 */
export function collectionOf(id: string): Attribution | undefined {
  return credits.get(id);
}

const { defaultSource } = SITE;

/**
 * The collections with wallpapers in the catalog, as /sources/ lists them: the
 * one the own wallpapers come from and the indexed ones.
 */
export const collections = listedCollections(wallpapers, [
  { id: defaultSource.id, repo: defaultSource.repo, name: defaultSource.title },
  ...sources.map((source) => ({ id: source.id, name: source.name, repo: source.repo })),
]);

/** Every collection, named equally in the intro and the footer. */
export const credited = creditedCollections(collections, (id) => url(`/sources/${id}/`));

const labels = new Map(tags.map((tag) => [tag.slug, tag.label]));

/** Tag slug to label, as the browser gets it in the compact index. */
export const tagLabels: Record<string, string> = Object.fromEntries(labels);

export function tagLabel(slug: string): string {
  return labels.get(slug) ?? slug;
}
