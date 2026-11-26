import { parse } from 'yaml';
import { toSlug } from './slug.ts';
import type { Attribution, Entry, FileFacts, Issue, Tag } from './types.ts';

export const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
export const MAX_BYTES = 25 * 1024 * 1024;
/** Long edge every wallpaper must reach. */
export const MIN_LONG_EDGE = 1280;
/** Long edge a newly contributed wallpaper must reach. */
export const MIN_LONG_EDGE_NEW = 1920;
const NEW_FILENAME = /^[a-z0-9]+(-[a-z0-9]+)*\.(png|jpg|jpeg|webp|gif)$/;
// Slugs become file paths and addresses, links become hrefs and swatches go into
// style attributes, so each is held to the one shape that is safe there.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const WEB_ADDRESS = /^https?:\/\/\S+$/;
const HEX_COLOUR = /^#[0-9a-f]{6}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseList(yamlText: string, what: string): Record<string, unknown>[] {
  const document: unknown = parse(yamlText) ?? [];
  if (!Array.isArray(document)) throw new Error(`${what} must be a list of entries`);
  return document.map((item, index) => {
    if (!isRecord(item)) throw new Error(`${what}: entry ${index + 1} must be a mapping`);
    return item;
  });
}

function text(item: Record<string, unknown>, key: string, where: string): string {
  const value = item[key];
  if (typeof value !== 'string') throw new Error(`${where} needs a "${key}" (text)`);
  return value;
}

function attribution(value: unknown, key: string, where: string): Attribution | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.name !== 'string') {
    throw new Error(`${where}: "${key}" needs a "name"`);
  }
  if (value.url === undefined) return { name: value.name };
  if (typeof value.url !== 'string' || !WEB_ADDRESS.test(value.url)) {
    throw new Error(`${where}: the "url" of "${key}" must start with http:// or https://`);
  }
  return { name: value.name, url: value.url };
}

/** Reads `data/wallpapers.yml`. Throws when the file is not shaped as documented. */
export function parseEntries(yamlText: string): Entry[] {
  return parseList(yamlText, 'wallpapers').map((item, index) => {
    const where = `wallpapers: entry ${index + 1}`;
    const file = text(item, 'file', where);
    const whereFile = `${where} (${file})`;
    const tags = item.tags;
    if (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string')) {
      throw new Error(`${whereFile} needs "tags" (a list of tag slugs)`);
    }
    const entry: Entry = { file, title: text(item, 'title', whereFile), tags: tags as string[] };
    if (item.featured === true) entry.featured = true;
    if (item.slug !== undefined) {
      if (typeof item.slug !== 'string' || !SLUG.test(item.slug)) {
        throw new Error(`${whereFile}: "slug" may only use lower-case letters, digits and hyphens`);
      }
      entry.slug = item.slug;
    }
    const credit = attribution(item.credit, 'credit', whereFile);
    if (credit) entry.credit = credit;
    const source = attribution(item.source, 'source', whereFile);
    if (source) entry.source = source;
    return entry;
  });
}

/** Reads `data/tags.yml`. Throws when the file is not shaped as documented. */
export function parseTags(yamlText: string): Tag[] {
  const seen = new Set<string>();
  return parseList(yamlText, 'tags').map((item, index) => {
    const where = `tags: entry ${index + 1}`;
    const slug = text(item, 'slug', where);
    if (!SLUG.test(slug)) throw new Error(`${where}: "slug" may only use lower-case letters, digits and hyphens`);
    if (seen.has(slug)) throw new Error(`tags: "${slug}" is defined twice`);
    seen.add(slug);
    const kind = item.kind;
    if (kind !== 'palette' && kind !== 'subject') {
      throw new Error(`${where} (${slug}): "kind" must be palette or subject`);
    }
    const tag: Tag = { slug, label: text(item, 'label', where), kind, description: text(item, 'description', where) };
    if (item.swatch !== undefined) {
      if (typeof item.swatch !== 'string' || !HEX_COLOUR.test(item.swatch)) {
        throw new Error(`${where} (${slug}): "swatch" must be a colour such as #88c0d0`);
      }
      tag.swatch = item.swatch;
    }
    return tag;
  });
}

export function slugOf(entry: Entry): string {
  return entry.slug ?? toSlug(entry.file);
}

function extensionOf(file: string): string {
  return file.slice(file.lastIndexOf('.') + 1).toLowerCase();
}

/** Every group of two or more items that share a key. */
function collisions<T>(items: T[], key: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/**
 * Checks the hand-written catalog against the image files.
 * `newFiles` are the files a pull request adds; they meet stricter rules
 * than the files that were already in the collection.
 */
export function validateCatalog(
  entries: Entry[],
  tags: Tag[],
  files: FileFacts[],
  opts: { newFiles?: string[] } = {},
): Issue[] {
  const issues: Issue[] = [];
  const report = (rule: string, file: string | undefined, message: string) => issues.push({ rule, file, message });

  const known = new Set(tags.map((tag) => tag.slug));
  const onDisk = new Set(files.map((facts) => facts.file));
  const listed = new Set(entries.map((entry) => entry.file));
  const added = new Set(opts.newFiles ?? []);

  for (const group of collisions(entries, (entry) => entry.file)) {
    report('duplicate-entry', group[0].file, `listed ${group.length} times in wallpapers.yml`);
  }

  for (const entry of new Map(entries.map((item) => [item.file, item])).values()) {
    if (!onDisk.has(entry.file)) {
      report('missing-file', entry.file, 'listed in wallpapers.yml but there is no such file in images/');
    }
    if (!entry.title.trim()) report('empty-title', entry.file, 'needs a title');
    for (const tag of entry.tags) {
      if (!known.has(tag)) report('unknown-tag', entry.file, `tag "${tag}" is not in tags.yml`);
    }
    if (new Set(entry.tags).size < 2) report('too-few-tags', entry.file, 'needs at least two different tags');
    if (!slugOf(entry)) {
      report('empty-slug', entry.file, 'the filename has no letters or digits; add a "slug" to the entry');
    }
  }

  for (const facts of files) {
    if (!listed.has(facts.file)) {
      report('missing-entry', facts.file, 'is in images/ but has no entry in wallpapers.yml');
    }
    if (!ALLOWED_EXTENSIONS.includes(extensionOf(facts.file))) {
      report('bad-extension', facts.file, `must be one of: ${ALLOWED_EXTENSIONS.join(', ')}`);
    }
    if (facts.bytes > MAX_BYTES) {
      report('too-large', facts.file, `is ${(facts.bytes / 1024 / 1024).toFixed(1)} MB; the limit is 25 MB`);
    }
    const isNew = added.has(facts.file);
    const minimum = isNew ? MIN_LONG_EDGE_NEW : MIN_LONG_EDGE;
    if (Math.max(facts.width, facts.height) < minimum) {
      report('too-small', facts.file, `is ${facts.width}×${facts.height}; the long edge must be at least ${minimum} px`);
    }
    if (isNew && !NEW_FILENAME.test(facts.file)) {
      report('bad-filename', facts.file, 'new files use lower-case letters, digits and hyphens, e.g. night-city.png');
    }
  }

  for (const group of collisions(files, (facts) => facts.file.toLowerCase())) {
    report('case-collision', group[0].file, `differs only by case from ${group.slice(1).map((f) => f.file).join(', ')}`);
  }
  for (const group of collisions(files, (facts) => facts.sha1)) {
    report('duplicate-content', group[0].file, `is the same image as ${group.slice(1).map((f) => f.file).join(', ')}`);
  }
  const sluggable = [...new Map(entries.map((item) => [item.file, item])).values()].filter((entry) => slugOf(entry));
  for (const group of collisions(sluggable, slugOf)) {
    report(
      'slug-collision',
      group[0].file,
      `shares the address "${slugOf(group[0])}" with ${group.slice(1).map((e) => e.file).join(', ')}; add a "slug" to one of them`,
    );
  }

  return issues;
}
