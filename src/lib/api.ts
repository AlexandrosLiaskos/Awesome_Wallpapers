// The entries of /api/wallpapers.json, the whole catalog for scripts and other tools.

import { media, SITE, url } from './site.ts';
import { sourceOf } from './site-data.ts';
import type { Wallpaper } from './types.ts';

export interface ApiEntry {
  slug: string;
  file: string;
  title: string;
  tags: string[];
  width: number;
  height: number;
  bytes: number;
  format: string;
  palette: string[];
  source: { id: string; name: string; url?: string };
  /** The ids of the other collections that have the same image. */
  alsoIn: string[];
  page: string;
  raw: string;
  thumb: string;
  preview: string;
}

/**
 * The id of the collection a wallpaper comes from, as its page under /sources/ uses it. Own
 * wallpapers come from D3Ext's collection; one contributed here directly, credited to its author,
 * has no collection page and stays "own".
 */
export function sourceIdOf(wallpaper: Wallpaper): string {
  if (wallpaper.sourceId !== 'own') return wallpaper.sourceId;
  return wallpaper.source ? 'own' : SITE.defaultSource.id;
}

/** A wallpaper as the JSON API gives it; `absolute` turns a site path into a full address. */
export function apiEntry(wallpaper: Wallpaper, absolute: (path: string) => string): ApiEntry {
  const { name, url: home } = sourceOf(wallpaper);
  return {
    slug: wallpaper.slug,
    file: wallpaper.file,
    title: wallpaper.title,
    tags: wallpaper.tags,
    width: wallpaper.width,
    height: wallpaper.height,
    bytes: wallpaper.bytes,
    format: wallpaper.format,
    palette: wallpaper.palette.map((swatch) => swatch.hex),
    source: { id: sourceIdOf(wallpaper), name, url: home },
    alsoIn: wallpaper.alsoIn,
    page: absolute(url(`/w/${wallpaper.slug}/`)),
    raw: wallpaper.download,
    thumb: absolute(media('t', wallpaper.slug)),
    preview: absolute(media('p', wallpaper.slug)),
  };
}
