import { describe, expect, it } from 'vitest';
import { apiEntry, sourceIdOf } from '../../src/lib/api.ts';
import { SITE } from '../../src/lib/site.ts';
import type { Wallpaper } from '../../src/lib/types.ts';

function wallpaper(slug: string, over: Partial<Wallpaper> = {}): Wallpaper {
  return {
    file: `${slug}.png`,
    title: 'Forest Cabin',
    tags: ['forest', 'cozy'],
    slug,
    width: 1920,
    height: 1080,
    bytes: 1234,
    format: 'PNG',
    aspect: '16:9',
    size: 'fhd',
    shape: 'desktop',
    palette: [{ hex: '#29352c', share: 0.4 }],
    colors: [],
    animated: false,
    download: `https://raw.githubusercontent.com/AlexandrosLiaskos/Awesome_Wallpapers/main/images/${slug}.png`,
    sourceId: 'own',
    alsoIn: [],
    phash: '0000000000000000',
    ...over,
  };
}

const absolute = (path: string) => new URL(path, 'https://wallpapers.liaskos.eu').href;

describe('sourceIdOf', () => {
  it('gives own wallpapers the id of their collection page, and indexed ones their collection id', () => {
    expect(sourceIdOf(wallpaper('cabin'))).toBe(SITE.defaultSource.id);
    expect(sourceIdOf(wallpaper('cabin', { sourceId: 'gruvbox-wallpapers' }))).toBe('gruvbox-wallpapers');
  });

  it('keeps "own" for a wallpaper contributed here directly, which has no collection page', () => {
    expect(sourceIdOf(wallpaper('hills', { source: { name: 'A contributor', url: 'https://github.com/x' } }))).toBe('own');
  });
});

describe('apiEntry', () => {
  it('describes a wallpaper with its collection, the collections that also have it and its addresses', () => {
    const entry = apiEntry(wallpaper('cabin', { alsoIn: ['gruvbox-wallpapers'] }), absolute);
    expect(entry).toEqual({
      slug: 'cabin',
      file: 'cabin.png',
      title: 'Forest Cabin',
      tags: ['forest', 'cozy'],
      width: 1920,
      height: 1080,
      bytes: 1234,
      format: 'PNG',
      palette: ['#29352c'],
      source: { id: 'aesthetic-wallpapers', name: SITE.defaultSource.name, url: SITE.defaultSource.url },
      alsoIn: ['gruvbox-wallpapers'],
      page: 'https://wallpapers.liaskos.eu/w/cabin/',
      raw: 'https://raw.githubusercontent.com/AlexandrosLiaskos/Awesome_Wallpapers/main/images/cabin.png',
      thumb: 'https://wallpapers.liaskos.eu/m/t/cabin.webp',
      preview: 'https://wallpapers.liaskos.eu/m/p/cabin.webp',
    });
  });
});
