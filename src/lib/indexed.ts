// How a file of another collection on GitHub becomes a wallpaper of the
// gallery. The original stays in its repository; only what was measured from it
// is kept here.

import type { Listing, RemoteFile } from '../../scripts/lib/github.ts';
import { MAX_TAGS } from './catalog.ts';
import { aspectLabel, formatOf, shapeOf, sizeClass } from './classify.ts';
import { bucketsOf } from './colors.ts';
import { slugify, toSlug } from './slug.ts';
import { inFolders, isWanted, type Source } from './sources.ts';
import { fallbackTitle, titleFromPath } from './titles.ts';
import type { ApprovedFile, Attribution, Wallpaper } from './types.ts';

const RAW_HOST = 'https://raw.githubusercontent.com';

// Git paths may hold spaces, "#", "&" or any letter, and each would break or
// change the address; the slashes between folders must stay as they are.
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function folderOf(path: string): string {
  return path.slice(0, Math.max(path.lastIndexOf('/'), 0));
}

/** The original file in the collection's own repository. */
export function rawFileUrl(source: Source, path: string): string {
  return `${RAW_HOST}/${source.repo}/${encodePath(source.branch)}/${encodePath(path)}`;
}

/** How a collection is credited: its name, linked to its repository. */
export function attributionOf(source: Source): Attribution {
  return { name: source.name, url: `https://github.com/${source.repo}` };
}

/**
 * A slug for an indexed file that is not in `taken`: the file name and the
 * collection's short name, then the folder in between when that is taken, then
 * a counter. The result has the shape of every catalog slug.
 */
export function indexedSlug(source: Source, path: string, taken: ReadonlySet<string>): string {
  const folder = slugify(folderOf(path));
  const fromName = toSlug(basename(path));
  const name = fromName || folder;
  const join = (...parts: string[]) => parts.filter(Boolean).join('-');

  const first = join(name, source.short);
  if (!taken.has(first)) return first;
  // The folder adds nothing when the name already is the folder.
  const base = fromName && folder ? join(name, folder, source.short) : first;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const numbered = `${base}-${n}`;
    if (!taken.has(numbered)) return numbered;
  }
}

/**
 * The approved files that may be shown. A file whose path is no longer listed,
 * or listed with different content, is left out until it is approved again. A
 * collection that is gone shows nothing; one that could not be listed keeps its
 * last approved files.
 */
export function availableFiles(approved: ApprovedFile[], listing: Listing): ApprovedFile[] {
  if (listing.kind === 'gone') return [];
  if (listing.kind === 'transient') return approved;
  const listed = new Map(listing.files.map((file) => [file.path, file.sha]));
  return approved.filter((file) => listed.get(file.path) === file.sha);
}

/** What changed in a collection since its files were approved; `files` are the wanted ones (see `isWanted`). */
export function diffListing(
  approved: ApprovedFile[],
  files: RemoteFile[],
): { added: RemoteFile[]; changed: RemoteFile[]; removed: ApprovedFile[] } {
  const known = new Map(approved.map((file) => [file.path, file.sha]));
  const listed = new Set(files.map((file) => file.path));
  return {
    added: files.filter((file) => !known.has(file.path)),
    changed: files.filter((file) => known.has(file.path) && known.get(file.path) !== file.sha),
    removed: approved.filter((file) => !listed.has(file.path)),
  };
}

/** Why a file of a collection is not proposed for review; the review summary counts files per reason. */
export const SKIP = {
  video: 'video',
  tooLarge: 'over 100 MB',
  lfs: 'Git LFS pointer',
  tooSmall: 'long edge under 1280 px',
  unreadable: 'not a readable image',
  download: 'could not be downloaded',
  moved: 'changed while it was downloaded',
} as const;

export interface Skipped {
  path: string;
  reason: string;
  /** What went wrong, when the reason alone does not say. */
  detail?: string;
}

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v', 'ogv', 'wmv', 'flv'];

/**
 * Splits a listing into the files worth downloading (see isWanted) and those skipped without
 * downloading: videos and images over 100 MB. Files outside the collection's folders, and files
 * that are neither pictures nor videos (a README, a licence), are not mentioned at all.
 */
export function screenFiles(files: RemoteFile[], source: Source): { wanted: RemoteFile[]; skipped: Skipped[] } {
  const wanted: RemoteFile[] = [];
  const skipped: Skipped[] = [];
  for (const file of files) {
    if (isWanted(file.path, file.size, source)) wanted.push(file);
    else if (!inFolders(file.path, source)) continue;
    else if (isWanted(file.path, 0, source)) skipped.push({ path: file.path, reason: SKIP.tooLarge });
    else if (VIDEO_EXTENSIONS.includes(file.path.slice(file.path.lastIndexOf('.') + 1).toLowerCase())) {
      skipped.push({ path: file.path, reason: SKIP.video });
    }
  }
  return { wanted, skipped };
}

/** Tags in the order of the lists, most trusted first, each once, at most MAX_TAGS. */
export function combineTags(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].slice(0, MAX_TAGS);
}

/**
 * The title of a new file: from its file name, or else from its first two tags and the lowest
 * number that no title in `titles` (the others of its collection) has.
 */
export function titleOf(path: string, tags: string[], labels: Record<string, string>, titles: ReadonlySet<string>): string {
  const named = titleFromPath(path);
  if (named) return named;
  for (let n = 1; ; n++) {
    const title = fallbackTitle(tags.slice(0, 2), labels, n);
    if (!titles.has(title)) return title;
  }
}

/** An approved file as a wallpaper, classified the same way as the own catalog. */
export function toWallpaper(source: Source, file: ApprovedFile): Wallpaper {
  const { width, height, palette } = file;
  // The file name names the download and gives the format.
  const name = basename(file.path);
  return {
    file: name,
    title: file.title,
    tags: file.tags,
    ...(file.featured ? { featured: true } : {}),
    slug: file.slug,
    source: attributionOf(source),
    width,
    height,
    bytes: file.bytes,
    format: formatOf(name),
    aspect: aspectLabel(width, height),
    size: sizeClass(width, height),
    shape: shapeOf(width, height),
    palette,
    colors: bucketsOf(palette),
    animated: file.animated,
    download: rawFileUrl(source, file.path),
    sourceId: source.id,
    alsoIn: [],
    phash: file.phash,
  };
}
