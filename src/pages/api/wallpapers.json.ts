// The whole catalog as one JSON file, for scripts and other tools.

import type { APIRoute } from 'astro';
import { apiEntry } from '../../lib/api.ts';
import { wallpapers } from '../../lib/data.ts';

export const GET: APIRoute = ({ site }) => {
  const absolute = (path: string) => new URL(path, site).href;
  return new Response(JSON.stringify(wallpapers.map((wallpaper) => apiEntry(wallpaper, absolute))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
