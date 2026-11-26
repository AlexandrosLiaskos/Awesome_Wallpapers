// The whole catalog as one JSON file, for scripts and other tools.

import type { APIRoute } from 'astro';
import { wallpapers } from '../../lib/data.ts';
import { media, url } from '../../lib/site.ts';
import { sourceOf } from '../../lib/site-data.ts';

export const GET: APIRoute = ({ site }) => {
  const absolute = (path: string) => new URL(path, site).href;

  const body = wallpapers.map((wallpaper) => {
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
      source: { id: wallpaper.sourceId, name, url: home },
      page: absolute(url(`/w/${wallpaper.slug}/`)),
      raw: wallpaper.download,
      thumb: absolute(media('t', wallpaper.slug)),
      preview: absolute(media('p', wallpaper.slug)),
    };
  });

  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
