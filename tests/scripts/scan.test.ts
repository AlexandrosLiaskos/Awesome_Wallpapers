import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanImages } from '../../scripts/lib/scan.ts';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'aw-scan-'));
  const blank = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: '#336699' } });
  await blank(1920, 1080).png().toFile(join(dir, 'wide.png'));
  await blank(1080, 2340).jpeg().toFile(join(dir, 'Tall One.jpg'));
  await writeFile(join(dir, 'notes.txt'), 'not an image');
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('scanImages', () => {
  it('lists every file in name order', async () => {
    const facts = await scanImages(dir);
    expect(facts.map((f) => f.file)).toEqual(['notes.txt', 'Tall One.jpg', 'wide.png']);
  });

  it('measures width and height', async () => {
    const facts = await scanImages(dir);
    expect(facts.find((f) => f.file === 'wide.png')).toMatchObject({ width: 1920, height: 1080 });
    expect(facts.find((f) => f.file === 'Tall One.jpg')).toMatchObject({ width: 1080, height: 2340 });
  });

  it('reports the size on disk and the SHA-1 of the bytes', async () => {
    const facts = await scanImages(dir);
    const wide = facts.find((f) => f.file === 'wide.png')!;
    const path = join(dir, 'wide.png');
    expect(wide.bytes).toBe((await stat(path)).size);
    expect(wide.sha1).toBe(createHash('sha1').update(await readFile(path)).digest('hex'));
  });

  it('gives a file that is not an image zero dimensions instead of failing', async () => {
    const facts = await scanImages(dir);
    expect(facts.find((f) => f.file === 'notes.txt')).toMatchObject({ width: 0, height: 0 });
  });
});
