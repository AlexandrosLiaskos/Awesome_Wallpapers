import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Listing, RemoteFile } from '../../scripts/lib/github.ts';
import type { Derived } from '../../scripts/lib/media.ts';
import { blobSha } from '../../scripts/lib/originals.ts';
import { contactSheet, PER_SHEET } from '../../scripts/lib/sheet.ts';
import { checkModel, formatApproved, summaryOf, syncSource, type SyncDeps, type SyncResult } from '../../scripts/sync.ts';
import { rawFileUrl, SKIP } from '../../src/lib/indexed.ts';
import type { Source } from '../../src/lib/sources.ts';
import type { ApprovedFile } from '../../src/lib/types.ts';

const source: Source = {
  id: 'nordic-wallpapers',
  short: 'nordic',
  name: 'Nordic Wallpapers',
  repo: 'linuxdotexe/nordic-wallpapers',
  branch: 'master',
  include: ['walls/'],
  exclude: [],
  tags: ['nord'],
  folders: { 'walls/forest': ['forest'] },
  status: 'active',
};

const labels = { nord: 'Nord', forest: 'Forest', city: 'City', night: 'Night', gruvbox: 'Gruvbox' };
const LFS = Buffer.from('version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 123\n');

/** A stand-in collection: each path has its bytes, what they measure and what the image taggers say about them. */
interface Fake {
  bytes: Buffer;
  derived?: Partial<Derived>;
  tags?: string[];
  hints?: string[];
  size?: number;
}

const measured = (over: Partial<Derived> = {}): Derived => ({
  width: 1920,
  height: 1080,
  bytes: 1000,
  animated: false,
  palette: [{ hex: '#88c0d0', share: 1 }],
  phash: '0123456789abcdef',
  ...over,
});

function image(name: string): Buffer {
  return Buffer.from(`image ${name}`);
}

function collection(files: Record<string, Fake>, over: Partial<SyncDeps> = {}) {
  const byUrl = new Map(Object.entries(files).map(([path, fake]) => [rawFileUrl(source, path), fake]));
  const byPreview = new Map(Object.values(files).map((fake) => [`preview of ${fake.bytes.toString()}`, fake]));
  const listing: Listing = {
    kind: 'ok',
    files: Object.entries(files).map(([path, fake]): RemoteFile => ({ path, sha: blobSha(fake.bytes), size: fake.size ?? fake.bytes.length })),
  };
  const deps = {
    listTree: vi.fn(async () => listing),
    fetchOriginal: vi.fn(async (url: string) => {
      const fake = byUrl.get(url);
      if (!fake) throw new Error(`${url} answered 404`);
      return fake.bytes;
    }),
    measure: vi.fn(async (bytes: Buffer) => {
      const fake = [...byUrl.values()].find((candidate) => candidate.bytes.equals(bytes));
      if (!fake?.derived) throw new Error('unsupported image format');
      return { derived: measured(fake.derived), preview: Buffer.from(`preview of ${bytes.toString()}`) };
    }),
    tag: vi.fn(async (preview: Buffer) => {
      const fake = byPreview.get(preview.toString())!;
      return { tags: fake.tags ?? [], hints: fake.hints ?? [] };
    }),
    taken: new Set<string>(),
    labels,
    ...over,
  };
  return { deps, listing };
}

function approved(path: string, bytes: Buffer, over: Partial<ApprovedFile> = {}): ApprovedFile {
  return {
    path,
    sha: blobSha(bytes),
    slug: `${path.replace(/\W+/g, '-')}-nordic`,
    title: 'Approved',
    tags: ['nord', 'forest'],
    ...measured(),
    ...over,
  };
}

describe('syncSource', () => {
  it('measures, tags and titles a new file and proposes it', async () => {
    const { deps } = collection({
      'walls/forest/cyberpunk_car.png': { bytes: image('car'), derived: { width: 3840, height: 2160, bytes: 5000 }, tags: ['city'] },
    });
    const result = await syncSource(source, [], deps);
    const car: ApprovedFile = {
      path: 'walls/forest/cyberpunk_car.png',
      sha: blobSha(image('car')),
      slug: 'cyberpunk-car-nordic',
      title: 'Cyberpunk Car',
      tags: ['nord', 'forest', 'city'],
      ...measured({ width: 3840, height: 2160, bytes: 5000 }),
    };
    expect(result.added).toEqual([car]);
    expect(result.approved).toEqual([car]);
    expect(result).toMatchObject({ held: [], changed: [], removed: [], skipped: [] });
    expect(deps.tag).toHaveBeenCalledWith(Buffer.from(`preview of ${image('car').toString()}`));
    expect(result.review).toEqual([{ file: car, status: 'added', preview: Buffer.from(`preview of ${image('car').toString()}`), hints: [] }]);
  });

  it('orders tags as collection, folder, then what the image gave, each once and at most five', async () => {
    const { deps } = collection({
      'walls/forest/lake.png': { bytes: image('lake'), derived: {}, tags: ['nord', 'gruvbox', 'city', 'night', 'neon', 'space'] },
    });
    const [lake] = (await syncSource(source, [], deps)).added;
    expect(lake.tags).toEqual(['nord', 'forest', 'gruvbox', 'city', 'night']);
  });

  it('skips a small image, a video, a Git LFS pointer and a file over 100 MB, saying why', async () => {
    const { deps } = collection({
      'walls/small.png': { bytes: image('small'), derived: { width: 1279, height: 720 } },
      'walls/clip.mp4': { bytes: image('clip') },
      'walls/lfs.png': { bytes: LFS, derived: {} },
      'walls/huge.png': { bytes: image('huge'), derived: {}, size: 104_857_601 },
      'walls/broken.png': { bytes: image('broken') },
    });
    const result = await syncSource(source, [], deps);
    expect(result.added).toEqual([]);
    expect(result.approved).toEqual([]);
    expect(result.skipped.map(({ path, reason }) => [path, reason]).sort()).toEqual([
      ['walls/broken.png', SKIP.unreadable],
      ['walls/clip.mp4', SKIP.video],
      ['walls/huge.png', SKIP.tooLarge],
      ['walls/lfs.png', SKIP.lfs],
      ['walls/small.png', SKIP.tooSmall],
    ]);
    // Neither the video nor the file over 100 MB is downloaded.
    expect(deps.fetchOriginal).toHaveBeenCalledTimes(3);
  });

  it('holds a file left with fewer than two tags, with its tags as they are', async () => {
    const { deps } = collection({ 'walls/IMG_2034.jpg': { bytes: image('img'), derived: {}, hints: ['sunset'] } });
    const result = await syncSource(source, [], deps);
    expect(result.added).toEqual([]);
    expect(result.held).toHaveLength(1);
    expect(result.held[0]).toMatchObject({ path: 'walls/IMG_2034.jpg', tags: ['nord'], held: true, title: 'Nord 1' });
    expect(result.approved).toEqual(result.held);
    expect(result.review[0]).toMatchObject({ status: 'held', hints: ['sunset'] });
  });

  it('titles meaningless names from their tags, numbered apart from the other titles of the collection', async () => {
    const kept = approved('walls/forest/old.png', image('old'), { title: 'Nord Forest 1' });
    const { deps } = collection({
      'walls/forest/old.png': { bytes: image('old') },
      'walls/forest/IMG_1.jpg': { bytes: image('one'), derived: {} },
      'walls/forest/wallhaven-x67oxo.png': { bytes: image('two'), derived: {} },
    });
    const result = await syncSource(source, [kept], deps);
    expect(result.added.map((file) => [file.path, file.title])).toEqual([
      ['walls/forest/IMG_1.jpg', 'Nord Forest 2'],
      ['walls/forest/wallhaven-x67oxo.png', 'Nord Forest 3'],
    ]);
  });

  it('gives slugs no own wallpaper or other collection uses, and claims them', async () => {
    const taken = new Set(['lake-nordic']);
    const { deps } = collection({ 'walls/lake.png': { bytes: image('lake'), derived: {}, tags: ['city'] } }, { taken });
    const [lake] = (await syncSource(source, [], deps)).added;
    expect(lake.slug).toBe('lake-walls-nordic');
    expect(taken.has('lake-walls-nordic')).toBe(true);
  });

  it('re-measures and re-tags a changed file, keeping its slug, title and featured mark', async () => {
    const before = approved('walls/forest/lake.png', image('lake v1'), { tags: ['forest', 'nord'], title: 'Hand Title', featured: true });
    const { deps } = collection({ 'walls/forest/lake.png': { bytes: image('lake v2'), derived: { width: 3840, height: 2160 } } });
    const result = await syncSource(source, [before], deps);
    const after = { ...before, sha: blobSha(image('lake v2')), tags: ['nord', 'forest'], width: 3840, height: 2160 };
    expect(result.changed).toEqual([after]);
    expect(result.approved).toEqual([after]);
    expect(result.kept).toEqual([]);
    expect(result.review).toMatchObject([{ status: 'changed' }]);
  });

  it('keeps the tags and title of a changed file whose tags differ from the machine, and says so', async () => {
    const before = approved('walls/forest/lake.png', image('lake v1'), { tags: ['nord', 'forest', 'night'], title: 'Hand Title' });
    const { deps } = collection({ 'walls/forest/lake.png': { bytes: image('lake v2'), derived: {}, tags: ['city'] } });
    const result = await syncSource(source, [before], deps);
    expect(result.changed).toEqual([{ ...before, sha: blobSha(image('lake v2')) }]);
    expect(result.kept).toEqual([{ path: 'walls/forest/lake.png', tags: ['nord', 'forest', 'night'], machine: ['nord', 'forest', 'city'] }]);
  });

  it('keeps the approved version of a changed file that could not be downloaded', async () => {
    const before = approved('walls/lake.png', image('lake v1'));
    const { deps } = collection(
      { 'walls/lake.png': { bytes: image('lake v2'), derived: {} } },
      { fetchOriginal: vi.fn(async () => Promise.reject(new Error('answered 503, after 3 tries'))) },
    );
    const result = await syncSource(source, [before], deps);
    expect(result.approved).toEqual([before]);
    expect(result.changed).toEqual([]);
    expect(result.skipped).toEqual([{ path: 'walls/lake.png', reason: SKIP.download, detail: 'answered 503, after 3 tries' }]);
  });

  it('skips a file whose download is not the listed version', async () => {
    const { deps, listing } = collection({ 'walls/lake.png': { bytes: image('lake'), derived: {} } });
    if (listing.kind === 'ok') listing.files[0].sha = 'f'.repeat(40);
    const result = await syncSource(source, [], deps);
    expect(result.skipped).toEqual([{ path: 'walls/lake.png', reason: SKIP.moved }]);
    expect(deps.measure).not.toHaveBeenCalled();
  });

  it('drops a removed file from the approved list', async () => {
    const lake = approved('walls/lake.png', image('lake'));
    const gone = approved('walls/gone.png', image('gone'));
    const { deps } = collection({ 'walls/lake.png': { bytes: image('lake') } });
    const result = await syncSource(source, [gone, lake], deps);
    expect(result.approved).toEqual([lake]);
    expect(result.removed).toEqual([gone]);
    expect(deps.fetchOriginal).not.toHaveBeenCalled();
  });

  it('writes the approved list sorted by path', async () => {
    const { deps } = collection({
      'walls/c.png': { bytes: image('c') },
      'walls/b.png': { bytes: image('b'), derived: {}, tags: ['city'] },
      'walls/a.png': { bytes: image('a'), derived: {}, tags: ['city'] },
    });
    const result = await syncSource(source, [approved('walls/c.png', image('c'))], deps);
    expect(result.approved.map((file) => file.path)).toEqual(['walls/a.png', 'walls/b.png', 'walls/c.png']);
  });

  it.each<[string, Listing]>([
    ['gone', { kind: 'gone', status: 404 }],
    ['transient', { kind: 'transient', reason: 'GitHub answered 502' }],
  ])('changes nothing when the listing is %s', async (_, listing) => {
    const lake = approved('walls/lake.png', image('lake'));
    const { deps } = collection({}, { listTree: vi.fn(async () => listing) });
    const result = await syncSource(source, [lake], deps);
    expect(result).toMatchObject({ approved: [lake], added: [], held: [], changed: [], removed: [], skipped: [] });
    expect(result.notSynced).toBeTruthy();
    expect(deps.fetchOriginal).not.toHaveBeenCalled();
  });

  it('proposes nothing new for a paused collection but still applies removals and changes', async () => {
    const paused: Source = { ...source, status: 'paused' };
    const lake = approved('walls/lake.png', image('lake v1'), { tags: ['nord', 'city'] });
    const gone = approved('walls/gone.png', image('gone'));
    const { deps } = collection({
      'walls/lake.png': { bytes: image('lake v2'), derived: {}, tags: ['city'] },
      'walls/new.png': { bytes: image('new'), derived: {}, tags: ['city'] },
    });
    const result = await syncSource(paused, [gone, lake], deps);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([gone]);
    expect(result.changed.map((file) => file.path)).toEqual(['walls/lake.png']);
    expect(deps.fetchOriginal).toHaveBeenCalledTimes(1);
  });

  it('does not list a removed collection at all', async () => {
    const { deps } = collection({});
    const result = await syncSource({ ...source, status: 'removed' }, [], deps);
    expect(deps.listTree).not.toHaveBeenCalled();
    expect(result.notSynced).toBeTruthy();
  });

  it('downloads at most four originals at once', async () => {
    const files = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`walls/f${i}.png`, { bytes: image(`f${i}`), derived: {}, tags: ['city'] }]));
    const { deps } = collection(files);
    const fetchOne = deps.fetchOriginal;
    let open = 0;
    let most = 0;
    deps.fetchOriginal = vi.fn(async (url: string) => {
      open += 1;
      most = Math.max(most, open);
      await new Promise((resolve) => setTimeout(resolve, 5));
      open -= 1;
      return fetchOne(url);
    });
    const result = await syncSource(source, [], deps);
    expect(result.added).toHaveLength(10);
    expect(most).toBe(4);
  });
});

describe('formatApproved', () => {
  it('writes one key per line, so a hand edit of the tags is a one-line change, and reads back the same', () => {
    const files = [approved('walls/a.png', image('a'), { held: true, tags: ['nord'] })];
    const text = formatApproved(files);
    expect(JSON.parse(text)).toEqual(files);
    expect(text).toContain('\n    "tags": ["nord"],\n');
    expect(formatApproved([])).toBe('[]\n');
  });
});

describe('checkModel', () => {
  const model = { id: 'Xenova/clip-vit-base-patch32', revision: 'abc', dtype: 'q8' };

  it('accepts weights fitted on the model that is loaded', () => {
    expect(() => checkModel({ ...model }, model)).not.toThrow();
  });

  it('stops when the weights name another model, and says how to fix it', () => {
    expect(() => checkModel({ ...model, revision: 'def' }, model)).toThrow(/eval-tagger/);
    expect(() => checkModel('Xenova/clip-vit-base-patch32, unit length', model)).toThrow(/tagger-weights\.json/);
  });
});

describe('summaryOf', () => {
  const empty: SyncResult = { approved: [], added: [], held: [], changed: [], removed: [], skipped: [], kept: [], review: [] };
  const held = approved('walls/IMG_1.jpg', image('one'), { tags: ['nord'], held: true, title: 'Nord 1' });
  const added = approved('walls/a.png', image('a'));
  const result: SyncResult = {
    ...empty,
    added: [added],
    held: [held],
    removed: [approved('walls/gone.png', image('gone'))],
    skipped: [
      { path: 'walls/s1.png', reason: SKIP.tooSmall },
      { path: 'walls/s2.png', reason: SKIP.tooSmall },
      { path: 'walls/v.mp4', reason: SKIP.video },
    ],
    kept: [{ path: 'walls/lake.png', tags: ['nord', 'night'], machine: ['nord', 'city'] }],
    review: [
      { file: held, status: 'held', preview: Buffer.alloc(0), hints: ['sunset'] },
      { file: added, status: 'added', preview: Buffer.alloc(0), hints: [] },
    ],
  };
  const text = summaryOf([
    { source, result, sheets: ['nordic-wallpapers-01.jpg'] },
    { source: { ...source, id: 'gruvbox', name: 'Gruvbox Wallpapers' }, result: { ...empty, notSynced: 'could not be listed (GitHub answered 502)' }, sheets: [] },
  ]);

  it('counts what happened in each collection', () => {
    expect(text).toContain('## Nordic Wallpapers');
    expect(text).toContain('- Added: 1');
    expect(text).toContain('- Held for hand tagging: 1 (fewer than two tags after tagging)');
    expect(text).toContain('- Changed: 0');
    expect(text).toContain('- Removed: 1');
    expect(text).toContain('- Skipped: 3 (long edge under 1280 px: 2, video: 1)');
    expect(text).toContain('nordic-wallpapers-01.jpg');
    expect(text).toContain('could not be listed (GitHub answered 502)');
  });

  it('lists the held files with their tags and where they are on the sheets, and the kept hand tags', () => {
    expect(text).toMatch(/\| Nordic Wallpapers \| 01, #1 \| `walls\/IMG_1\.jpg` \| nord \| sunset \|/);
    expect(text).toContain('`walls/lake.png`: kept nord, night; the machine gives nord, city');
  });

  it('is plain text without em dashes', () => {
    expect(text).not.toContain('—');
  });
});

describe('contactSheet', () => {
  let dir: string;
  let cells: { image: Buffer; title: string; tags: string[]; note?: string }[];

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-sheet-'));
    const picture = await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#2a4d8e' } }).webp().toBuffer();
    cells = Array.from({ length: PER_SHEET + 1 }, (_, i) => ({
      image: picture,
      title: i === 0 ? 'Rocks & <Rivers> "at" night' : `Wallpaper ${i + 1}`,
      tags: ['nord', 'forest'],
      note: i === 0 ? 'held, hints: sunset' : undefined,
    }));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('puts 24 files on a sheet, as numbered JPEGs about 1600 px wide', async () => {
    const written = await contactSheet(cells, join(dir, 'nordic'));
    expect(written).toEqual([join(dir, 'nordic-01.jpg'), join(dir, 'nordic-02.jpg')]);
    for (const path of written) {
      const meta = await sharp(await readFile(path)).metadata();
      expect(meta).toMatchObject({ format: 'jpeg', width: 1600 });
    }
  });

  it('writes the index, title and tags under each picture', async () => {
    const [first] = await contactSheet(cells.slice(0, 1), join(dir, 'label'));
    const sheet = sharp(await readFile(first));
    const { width = 0, height = 0 } = await sheet.metadata();
    // The band under the first picture holds light text on the dark background.
    const band = await sheet.extract({ left: 0, top: Math.round(height * 0.8), width: Math.round(width / 4), height: Math.round(height * 0.2) }).stats();
    expect(Math.max(...band.channels.map((channel) => channel.max))).toBeGreaterThan(200);
  });

  it('writes nothing when there is nothing to review', async () => {
    expect(await contactSheet([], join(dir, 'none'))).toEqual([]);
  });
});
