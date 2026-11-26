import type { Attribution } from './types.ts';

export const SITE = {
  name: 'Awesome Wallpapers',
  description: 'A fast, searchable gallery of aesthetic wallpapers. Free to download, no ads, no tracking.',
  repo: 'https://github.com/AlexandrosLiaskos/Awesome_Wallpapers',
  /** Where a wallpaper comes from unless its entry says otherwise. It is also listed under Collections. */
  defaultSource: {
    name: 'D3Ext/aesthetic-wallpapers',
    url: 'https://github.com/D3Ext/aesthetic-wallpapers',
    repo: 'D3Ext/aesthetic-wallpapers',
    /** Its address under /sources/; no collection in data/sources.yml may take it. */
    id: 'aesthetic-wallpapers',
  } satisfies Attribution & { repo: string; id: string },
};

// The base path of the site ("/" on its own domain, and outside Astro, in tests).
const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');

/** An internal address, with the base path in front. */
export function url(path: string): string {
  return BASE + (path.startsWith('/') ? path : `/${path}`);
}

/** The address of a generated image: thumbnail (t), preview (p) or share image (og). */
export function media(kind: 't' | 'p' | 'og', slug: string, suffix: '' | '@2x' = ''): string {
  return url(`/m/${kind}/${slug}${suffix}.${kind === 'og' ? 'jpg' : 'webp'}`);
}
