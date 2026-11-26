import { parse } from 'yaml';

export interface Source {
  id: string;
  short: string;
  name: string;
  repo: string;
  branch: string;
  include: string[];
  exclude: string[];
  tags: string[];
  folders: Record<string, string[]>;
  status: 'active' | 'paused' | 'removed';
}

/** Largest original that is indexed; 100 MB, inclusive. */
export const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
const STATUSES = ['active', 'paused', 'removed'];
// Same shape as catalog slugs: ids and short names end up in addresses and file names.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// GitHub's own limits: owner letters, digits and single hyphens; repo letters, digits, ".", "_" and "-".
const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}\/[A-Za-z0-9._-]{1,100}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown, key: string, where: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${where}: "${key}" must be a list of text`);
  }
  return value as string[];
}

function prefixes(value: unknown, key: string, where: string): string[] {
  return stringList(value, key, where).map((prefix) => (prefix === '' || prefix.endsWith('/') ? prefix : `${prefix}/`));
}

function knownTags(tags: string[], known: Set<string>, what: string, where: string): string[] {
  for (const tag of tags) {
    if (!known.has(tag)) throw new Error(`${where}: ${what} "${tag}" is not in tags.yml`);
  }
  return tags;
}

/** Reads `data/sources.yml`. Throws when the file is not shaped as documented. */
export function parseSources(yamlText: string, knownTagSlugs: string[]): Source[] {
  const document: unknown = parse(yamlText) ?? [];
  if (!Array.isArray(document)) throw new Error('sources must be a list of entries');
  const known = new Set(knownTagSlugs);
  const ids = new Set<string>();
  const shorts = new Set<string>();
  const repos = new Set<string>();

  return document.map((item, index) => {
    if (!isRecord(item)) throw new Error(`sources: entry ${index + 1} must be a mapping`);
    const where = `sources: entry ${index + 1}`;
    const text = (key: string): string => {
      const value = item[key];
      if (typeof value !== 'string' || !value.trim()) throw new Error(`${where} needs a "${key}" (text)`);
      return value;
    };
    const id = text('id');
    const whereId = `${where} (${id})`;
    if (!SLUG.test(id)) throw new Error(`${whereId}: "id" may only use lower-case letters, digits and hyphens`);
    const short = text('short');
    if (!SLUG.test(short)) throw new Error(`${whereId}: "short" may only use lower-case letters, digits and hyphens`);
    const repo = text('repo');
    if (!REPO.test(repo)) throw new Error(`${whereId}: "repo" must look like owner/name, got "${repo}"`);
    const status = item.status ?? 'active';
    if (typeof status !== 'string' || !STATUSES.includes(status)) {
      throw new Error(`${whereId}: "status" must be active, paused or removed`);
    }
    if (ids.has(id)) throw new Error(`sources: "${id}" is defined twice`);
    if (shorts.has(short)) throw new Error(`sources: the "short" name "${short}" is used twice`);
    if (repos.has(repo.toLowerCase())) throw new Error(`sources: "${repo}" is defined twice`);
    ids.add(id);
    shorts.add(short);
    repos.add(repo.toLowerCase());

    const folders: Record<string, string[]> = {};
    if (item.folders !== undefined) {
      if (!isRecord(item.folders)) throw new Error(`${whereId}: "folders" must map folder paths to tags`);
      for (const [folder, tags] of Object.entries(item.folders)) {
        const key = folder.replace(/\/+$/, '');
        folders[key] = knownTags(stringList(tags, `folders.${folder}`, whereId), known, `folder "${folder}" uses the tag`, whereId);
      }
    }

    return {
      id,
      short,
      name: text('name'),
      repo,
      branch: text('branch'),
      include: prefixes(item.include, 'include', whereId),
      exclude: prefixes(item.exclude, 'exclude', whereId),
      tags: knownTags(stringList(item.tags, 'tags', whereId), known, 'the tag', whereId),
      folders,
      status: status as Source['status'],
    };
  });
}

/** Whether a file of the collection is an image worth indexing. */
export function isWanted(path: string, size: number, source: Source): boolean {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (!IMAGE_EXTENSIONS.includes(extension) || path.lastIndexOf('.') < path.lastIndexOf('/')) return false;
  if (size > MAX_SOURCE_BYTES) return false;
  if (source.include.length > 0 && !source.include.some((prefix) => path.startsWith(prefix))) return false;
  return !source.exclude.some((prefix) => path.startsWith(prefix));
}

/** The collection's own tags plus those of the deepest mapped folder above the file. */
export function folderTags(path: string, source: Source): string[] {
  const parts = path.split('/').slice(0, -1);
  let mapped: string[] = [];
  for (let depth = parts.length; depth > 0; depth--) {
    const found = source.folders[parts.slice(0, depth).join('/')];
    if (found) {
      mapped = found;
      break;
    }
  }
  return [...new Set([...source.tags, ...mapped])];
}
