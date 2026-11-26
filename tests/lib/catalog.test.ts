import { describe, expect, it } from 'vitest';
import { parseEntries, parseTags, slugOf, validateCatalog } from '../../src/lib/catalog.ts';
import type { Entry, FileFacts, Tag } from '../../src/lib/types.ts';

const tags: Tag[] = [
  { slug: 'nord', label: 'Nord', kind: 'palette', description: 'Nord palette.', swatch: '#88c0d0' },
  { slug: 'city', label: 'City', kind: 'subject', description: 'Cities.' },
  { slug: 'night', label: 'Night', kind: 'subject', description: 'After dark.' },
];

function entry(over: Partial<Entry> = {}): Entry {
  return { file: 'night-city.png', title: 'Night City', tags: ['nord', 'city'], ...over };
}

function facts(over: Partial<FileFacts> = {}): FileFacts {
  return { file: 'night-city.png', bytes: 1_000_000, width: 3840, height: 2160, sha1: 'a'.repeat(40), ...over };
}

function rules(entries: Entry[], files: FileFacts[], newFiles?: string[]): string[] {
  return validateCatalog(entries, tags, files, { newFiles }).map((issue) => issue.rule);
}

describe('parseEntries', () => {
  it('reads the documented shape', () => {
    const yaml = [
      '- file: lets_go_home.png',
      '  title: "Let\'s Go Home"',
      '  tags: [nord, city]',
      '  featured: true',
      '  credit:',
      '    name: Someone',
      '    url: https://example.com',
    ].join('\n');
    expect(parseEntries(yaml)).toEqual([
      {
        file: 'lets_go_home.png',
        title: "Let's Go Home",
        tags: ['nord', 'city'],
        featured: true,
        credit: { name: 'Someone', url: 'https://example.com' },
      },
    ]);
  });

  it('rejects a document that is not a list', () => {
    expect(() => parseEntries('file: a.png')).toThrow(/list/);
  });

  it('names the entry that has no file', () => {
    expect(() => parseEntries('- title: Orphan\n  tags: [a, b]')).toThrow(/entry 1.*file/);
  });

  it('treats an empty document as an empty catalog', () => {
    expect(parseEntries('')).toEqual([]);
  });
});

describe('parseTags', () => {
  it('reads the documented shape', () => {
    const yaml = '- slug: nord\n  label: Nord\n  kind: palette\n  description: Nord palette.\n  swatch: "#88c0d0"';
    expect(parseTags(yaml)).toEqual([tags[0]]);
  });

  it('rejects an unknown kind', () => {
    expect(() => parseTags('- slug: x\n  label: X\n  kind: mood\n  description: d')).toThrow(/kind/);
  });

  it('rejects a repeated slug', () => {
    const one = '- slug: x\n  label: X\n  kind: subject\n  description: d\n';
    expect(() => parseTags(one + one)).toThrow(/"x"/);
  });
});

describe('slugOf', () => {
  it('derives the slug from the filename', () => {
    expect(slugOf(entry({ file: 'Night_City.png' }))).toBe('night-city');
  });

  it('prefers an explicit slug', () => {
    expect(slugOf(entry({ slug: 'custom' }))).toBe('custom');
  });
});

describe('validateCatalog', () => {
  it('accepts a clean catalog', () => {
    expect(validateCatalog([entry()], tags, [facts()])).toEqual([]);
  });

  it('reports an image without an entry', () => {
    expect(rules([], [facts()])).toEqual(['missing-entry']);
  });

  it('reports an entry without an image', () => {
    expect(rules([entry()], [])).toEqual(['missing-file']);
  });

  it('reports a file listed twice', () => {
    expect(rules([entry(), entry()], [facts()])).toEqual(['duplicate-entry']);
  });

  it('reports a tag outside the vocabulary', () => {
    expect(rules([entry({ tags: ['nord', 'city', 'vaporwave'] })], [facts()])).toEqual(['unknown-tag']);
  });

  it('reports fewer than two distinct tags', () => {
    expect(rules([entry({ tags: ['nord', 'nord'] })], [facts()])).toEqual(['too-few-tags']);
  });

  it('reports a blank title', () => {
    expect(rules([entry({ title: '  ' })], [facts()])).toEqual(['empty-title']);
  });

  it('reports an extension that is not an allowed image type', () => {
    expect(rules([entry({ file: 'night-city.bmp' })], [facts({ file: 'night-city.bmp' })])).toEqual(['bad-extension']);
  });

  it('reports names that differ only by case', () => {
    const files = [facts(), facts({ file: 'Night-City.png', sha1: 'b'.repeat(40) })];
    const entries = [entry(), entry({ file: 'Night-City.png', slug: 'night-city-2' })];
    expect(rules(entries, files)).toEqual(['case-collision']);
  });

  it('reports identical content under two names', () => {
    const files = [facts(), facts({ file: 'copy.png' })];
    const entries = [entry(), entry({ file: 'copy.png' })];
    expect(rules(entries, files)).toEqual(['duplicate-content']);
  });

  it('reports a file over 25 MB', () => {
    expect(rules([entry()], [facts({ bytes: 25 * 1024 * 1024 + 1 })])).toEqual(['too-large']);
  });

  it('accepts a file of exactly 25 MB', () => {
    expect(rules([entry()], [facts({ bytes: 25 * 1024 * 1024 })])).toEqual([]);
  });

  it('reports a long edge under 1280 px', () => {
    expect(rules([entry()], [facts({ width: 1279, height: 720 })])).toEqual(['too-small']);
  });

  it('accepts 1919 px for a file that is already in the collection', () => {
    expect(rules([entry()], [facts({ width: 1919, height: 1080 })])).toEqual([]);
  });

  it('reports 1919 px for a newly added file', () => {
    expect(rules([entry()], [facts({ width: 1919, height: 1080 })], ['night-city.png'])).toEqual(['too-small']);
  });

  it('measures portrait images by their long edge', () => {
    expect(rules([entry()], [facts({ width: 1080, height: 1920 })], ['night-city.png'])).toEqual([]);
  });

  it('reports a new filename that is not lower-case kebab-case', () => {
    const files = [facts({ file: 'Night_City.png' })];
    expect(rules([entry({ file: 'Night_City.png' })], files, ['Night_City.png'])).toEqual(['bad-filename']);
  });

  it('leaves existing filenames alone', () => {
    const files = [facts({ file: 'Night_City.png' })];
    expect(rules([entry({ file: 'Night_City.png' })], files)).toEqual([]);
  });

  it('reports two entries that resolve to the same slug', () => {
    const files = [facts(), facts({ file: 'night_city.jpg', sha1: 'b'.repeat(40) })];
    const entries = [entry(), entry({ file: 'night_city.jpg' })];
    expect(rules(entries, files)).toEqual(['slug-collision']);
  });

  it('reports a filename that leaves no slug', () => {
    const files = [facts({ file: '___.png' })];
    expect(rules([entry({ file: '___.png' })], files)).toEqual(['empty-slug']);
  });

  it('names the offending file and says what is wrong', () => {
    const [issue] = validateCatalog([entry({ title: '' })], tags, [facts()]);
    expect(issue.file).toBe('night-city.png');
    expect(issue.message).toMatch(/title/);
  });
});

describe('what the data files may contain', () => {
  const entryWith = (extra: string) => `- file: a.png\n  title: A\n  tags: [nord, city]\n${extra}`;

  it('rejects a slug that is not lower-case kebab-case, since it becomes a path and an address', () => {
    expect(() => parseEntries(entryWith('  slug: ../../escape'))).toThrow(/slug/);
    expect(() => parseEntries(entryWith('  slug: Has Spaces'))).toThrow(/slug/);
  });

  it('accepts a well-formed slug', () => {
    expect(parseEntries(entryWith('  slug: night-city-2'))[0].slug).toBe('night-city-2');
  });

  it('rejects a credit or source link that is not a web address', () => {
    expect(() => parseEntries(entryWith('  credit:\n    name: X\n    url: "javascript:alert(1)"'))).toThrow(/url/);
    expect(() => parseEntries(entryWith('  source:\n    name: X\n    url: ftp://example.com'))).toThrow(/url/);
  });

  it('accepts http and https links', () => {
    const [entry] = parseEntries(entryWith('  credit:\n    name: X\n    url: https://example.com/x'));
    expect(entry.credit).toEqual({ name: 'X', url: 'https://example.com/x' });
  });

  it('rejects a swatch that is not a six-digit hex colour', () => {
    const tag = (swatch: string) => `- slug: x\n  label: X\n  kind: palette\n  description: d\n  swatch: "${swatch}"`;
    expect(() => parseTags(tag('red'))).toThrow(/swatch/);
    expect(() => parseTags(tag('#fff;background:url(x)'))).toThrow(/swatch/);
    expect(parseTags(tag('#88C0D0'))[0].swatch).toBe('#88C0D0');
  });

  it('rejects a tag slug that is not lower-case kebab-case', () => {
    expect(() => parseTags('- slug: Pixel Art\n  label: X\n  kind: subject\n  description: d')).toThrow(/slug/);
  });
});
