import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseTags } from '../../src/lib/catalog.ts';
import { SITE } from '../../src/lib/site.ts';
import { folderTags, isWanted, parseSources, type Source } from '../../src/lib/sources.ts';

const known = ['nord', 'anime', 'gaming', 'minimal', 'photo'];

function source(over: Partial<Source> = {}): Source {
  return {
    id: 'nordic',
    short: 'nordic',
    name: 'Nordic Wallpapers',
    repo: 'linuxdotexe/nordic-wallpapers',
    branch: 'master',
    include: ['wallpapers/'],
    exclude: ['wallpapers/old/'],
    tags: ['nord'],
    folders: { 'wallpapers/anime': ['anime'], 'wallpapers/anime/light': ['minimal'] },
    status: 'active',
    ...over,
  };
}

const entry = `
- id: nordic
  short: nordic
  name: Nordic Wallpapers
  repo: linuxdotexe/nordic-wallpapers
  branch: master
  include: [wallpapers/]
  tags: [nord]
  status: active
`;

describe('parseSources', () => {
  it('parses the pilot file against the real tags', () => {
    const tags = parseTags(readFileSync('data/tags.yml', 'utf8')).map((t) => t.slug);
    const sources = parseSources(readFileSync('data/sources.yml', 'utf8'), tags);
    expect(sources.map((s) => s.repo)).toEqual([
      'linuxdotexe/nordic-wallpapers',
      'rose-pine/wallpapers',
      'AngelJumbo/gruvbox-wallpapers',
    ]);
    expect(sources.every((s) => s.status === 'active')).toBe(true);
  });

  it('fills in defaults', () => {
    const [s] = parseSources(entry, known);
    expect(s).toMatchObject({ exclude: [], folders: {}, include: ['wallpapers/'], status: 'active' });
  });

  it('rejects unknown tags, in tags and in folders', () => {
    expect(() => parseSources(entry.replace('[nord]', '[nope]'), known)).toThrow(/nope/);
    expect(() => parseSources(entry + '  folders:\n    wallpapers/a: [nope]\n', known)).toThrow(/nope/);
  });

  it('rejects duplicate id and short', () => {
    const second = entry.replace('nordic-wallpapers', 'two');
    expect(() => parseSources(entry + second, known)).toThrow(/defined twice/);
    expect(() => parseSources(entry + second.replace('id: nordic', 'id: two'), known)).toThrow(/short/);
  });

  it('rejects a bad repo', () => {
    for (const repo of ['nordic', 'a/b/c', 'a b/c', 'https://github.com/a/b']) {
      expect(() => parseSources(entry.replace('linuxdotexe/nordic-wallpapers', repo), known)).toThrow(/repo/);
    }
  });

  it('rejects a bad status and a bad id', () => {
    expect(() => parseSources(entry.replace('active', 'gone'), known)).toThrow(/status/);
    expect(() => parseSources(entry.replace('id: nordic', 'id: Nordic'), known)).toThrow(/id/);
  });

  it('reserves "own" and the id of the collection the own wallpapers come from', () => {
    expect(SITE.defaultSource.id).toBe('aesthetic-wallpapers');
    for (const id of ['own', SITE.defaultSource.id]) {
      expect(() => parseSources(entry.replace('id: nordic', `id: ${id}`), known)).toThrow(/reserved/);
    }
  });
});

describe('isWanted', () => {
  const s = source();
  it('accepts images under include', () => {
    expect(isWanted('wallpapers/a b.png', 1000, s)).toBe(true);
    expect(isWanted('wallpapers/A.JPG', 1000, s)).toBe(true);
  });
  it('rejects videos, other folders, excluded folders', () => {
    expect(isWanted('wallpapers/a.mp4', 1000, s)).toBe(false);
    expect(isWanted('other/a.png', 1000, s)).toBe(false);
    expect(isWanted('wallpapers-extra/a.png', 1000, s)).toBe(false);
    expect(isWanted('wallpapers/old/a.png', 1000, s)).toBe(false);
  });
  it('allows exactly 100 MB and rejects one byte more', () => {
    expect(isWanted('wallpapers/a.png', 104_857_600, s)).toBe(true);
    expect(isWanted('wallpapers/a.png', 104_857_601, s)).toBe(false);
  });
  it('wants everything when include is empty', () => {
    expect(isWanted('x/a.webp', 1, source({ include: [] }))).toBe(true);
  });
});

describe('folderTags', () => {
  it('uses the source tags plus the deepest mapped folder', () => {
    expect(folderTags('wallpapers/anime/light/x.png', source())).toEqual(['nord', 'minimal']);
    expect(folderTags('wallpapers/anime/x.png', source())).toEqual(['nord', 'anime']);
  });
  it('falls back to the nearest mapped ancestor and to the source tags', () => {
    expect(folderTags('wallpapers/anime/deep/er/x.png', source())).toEqual(['nord', 'anime']);
    expect(folderTags('wallpapers/other/x.png', source())).toEqual(['nord']);
  });
  it('does not treat a folder name prefix as a match and deduplicates', () => {
    expect(folderTags('wallpapers/animex/x.png', source())).toEqual(['nord']);
    expect(folderTags('wallpapers/anime/x.png', source({ folders: { 'wallpapers/anime': ['nord', 'anime'] } }))).toEqual(['nord', 'anime']);
  });
});
