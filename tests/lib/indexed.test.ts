import { describe, expect, it } from 'vitest';
import type { RemoteFile } from '../../scripts/lib/github.ts';
import { bucketsOf } from '../../src/lib/colors.ts';
import { availableFiles, diffListing, indexedSlug, rawFileUrl, toWallpaper } from '../../src/lib/indexed.ts';
import type { Source } from '../../src/lib/sources.ts';
import type { ApprovedFile } from '../../src/lib/types.ts';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const source: Source = {
  id: 'anime-walls',
  short: 'anime',
  name: 'Anime Walls',
  repo: 'someone/anime-walls',
  branch: 'main',
  include: [],
  exclude: [],
  tags: [],
  folders: {},
  status: 'active',
};

function approved(path: string, sha: string, over: Partial<ApprovedFile> = {}): ApprovedFile {
  return {
    path,
    sha,
    slug: 'x',
    title: 'X',
    tags: ['anime', 'neon'],
    width: 1920,
    height: 1080,
    bytes: 1000,
    animated: false,
    palette: [{ hex: '#3355aa', share: 1 }],
    phash: '0123456789abcdef',
    ...over,
  };
}

const remote = (path: string, sha: string): RemoteFile => ({ path, sha, size: 1000 });

describe('rawFileUrl', () => {
  it('percent-encodes each path segment and keeps the slashes', () => {
    expect(rawFileUrl(source, 'Anime Wallpapers/Ünïcode #1 & 2.png')).toBe(
      'https://raw.githubusercontent.com/someone/anime-walls/main/Anime%20Wallpapers/%C3%9Cn%C3%AFcode%20%231%20%26%202.png',
    );
  });

  it('encodes the branch segment by segment too', () => {
    expect(rawFileUrl({ ...source, branch: 'release/v 2' }, 'a.png')).toBe(
      'https://raw.githubusercontent.com/someone/anime-walls/release/v%202/a.png',
    );
  });
});

describe('indexedSlug', () => {
  it('is the slug of the file name followed by the collection short name', () => {
    expect(indexedSlug(source, 'wallpapers/Neon City.png', new Set())).toBe('neon-city-anime');
  });

  it('adds the folder when that slug is taken', () => {
    const taken = new Set(['neon-city-anime']);
    expect(indexedSlug(source, 'wallpapers/light/Neon City.png', taken)).toBe('neon-city-wallpapers-light-anime');
  });

  it('then counts up', () => {
    const taken = new Set(['neon-city-anime', 'neon-city-wallpapers-anime']);
    expect(indexedSlug(source, 'wallpapers/Neon City.png', taken)).toBe('neon-city-wallpapers-anime-2');
    taken.add('neon-city-wallpapers-anime-2');
    expect(indexedSlug(source, 'wallpapers/Neon City.png', taken)).toBe('neon-city-wallpapers-anime-3');
  });

  it('counts up straight away for a file at the top of the repository', () => {
    expect(indexedSlug(source, 'Neon City.png', new Set(['neon-city-anime']))).toBe('neon-city-anime-2');
  });

  it('uses the folder when the file name has no letters or digits', () => {
    expect(indexedSlug(source, 'wallpapers/anime/___.png', new Set())).toBe('wallpapers-anime-anime');
    expect(indexedSlug(source, '___.png', new Set())).toBe('anime');
  });

  it('keeps a dot in a folder name instead of reading it as an extension', () => {
    expect(indexedSlug(source, 'v1.5/Neon.png', new Set(['neon-anime']))).toBe('neon-v1-5-anime');
  });

  it('always gives a catalog slug', () => {
    const taken = new Set<string>();
    for (const path of ['Anime Wallpapers/Ünïcode #1 & 2.png', '-/__/.png', 'A/B/C.D.E.jpg', 'x/y/z.png', 'x/y/z.png']) {
      const slug = indexedSlug(source, path, taken);
      expect(slug).toMatch(SLUG);
      expect(taken.has(slug)).toBe(false);
      taken.add(slug);
    }
  });
});

describe('availableFiles', () => {
  const list = [approved('a.png', 'sha-a'), approved('b.png', 'sha-b'), approved('c.png', 'sha-c')];

  it('keeps a file only when its path is listed with the same SHA', () => {
    const listing = { kind: 'ok' as const, files: [remote('a.png', 'sha-a'), remote('b.png', 'changed'), remote('d.png', 'sha-d')] };
    expect(availableFiles(list, listing).map((file) => file.path)).toEqual(['a.png']);
  });

  it('keeps nothing of a collection that is gone', () => {
    expect(availableFiles(list, { kind: 'gone', status: 404 })).toEqual([]);
  });

  it('keeps everything when the listing failed for a passing reason', () => {
    expect(availableFiles(list, { kind: 'transient', reason: 'GitHub answered 502' })).toEqual(list);
  });
});

describe('diffListing', () => {
  it('reports added, changed and removed files', () => {
    const list = [approved('a.png', 'sha-a'), approved('b.png', 'sha-b'), approved('c.png', 'sha-c')];
    const files = [remote('a.png', 'sha-a'), remote('b.png', 'sha-b2'), remote('d.png', 'sha-d')];
    expect(diffListing(list, files)).toEqual({
      added: [remote('d.png', 'sha-d')],
      changed: [remote('b.png', 'sha-b2')],
      removed: [list[2]],
    });
  });

  it('reports nothing when the listing matches', () => {
    expect(diffListing([approved('a.png', 'sha-a')], [remote('a.png', 'sha-a')])).toEqual({ added: [], changed: [], removed: [] });
  });
});

describe('toWallpaper', () => {
  const palette = [
    { hex: '#3355aa', share: 0.7 },
    { hex: '#111111', share: 0.3 },
  ];
  const file = approved('wallpapers/anime/Neon City.jpeg', 'sha-n', {
    slug: 'neon-city-anime',
    title: 'Neon City',
    width: 3840,
    height: 2160,
    bytes: 4321,
    palette,
    phash: 'fedcba9876543210',
  });

  it('describes the file as the own catalog does', () => {
    const wallpaper = toWallpaper(source, file);
    expect(wallpaper).toEqual({
      file: 'Neon City.jpeg',
      title: 'Neon City',
      tags: ['anime', 'neon'],
      slug: 'neon-city-anime',
      source: { name: 'Anime Walls', url: 'https://github.com/someone/anime-walls' },
      width: 3840,
      height: 2160,
      bytes: 4321,
      format: 'JPG',
      aspect: '16:9',
      size: '4k',
      shape: 'desktop',
      palette,
      colors: bucketsOf(palette),
      animated: false,
      download: rawFileUrl(source, 'wallpapers/anime/Neon City.jpeg'),
      sourceId: 'anime-walls',
      alsoIn: [],
      phash: 'fedcba9876543210',
    });
  });

  it('classifies portrait and animated files', () => {
    const tall = toWallpaper(source, { ...file, path: 'p/loop.gif', width: 1080, height: 2340, animated: true });
    expect(tall).toMatchObject({ file: 'loop.gif', format: 'GIF', shape: 'phone', size: 'fhd', animated: true });
  });

  it('keeps the featured mark only when it is set', () => {
    expect(toWallpaper(source, { ...file, featured: true }).featured).toBe(true);
    expect('featured' in toWallpaper(source, file)).toBe(false);
  });
});
