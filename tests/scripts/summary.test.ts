import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeJobSummary } from '../../scripts/lib/summary.ts';

describe('writeJobSummary', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aw-summary-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('adds to the file GITHUB_STEP_SUMMARY names, after what is there', async () => {
    const file = join(dir, 'summary.md');
    await writeFile(file, '## Earlier step\n\n');
    await writeJobSummary('## Collections left out\n\n- Nordic Wallpapers is gone\n', { GITHUB_STEP_SUMMARY: file });
    expect(await readFile(file, 'utf8')).toBe('## Earlier step\n\n## Collections left out\n\n- Nordic Wallpapers is gone\n\n');
  });

  it('does nothing outside GitHub Actions', async () => {
    await expect(writeJobSummary('## Build stopped', {})).resolves.toBeUndefined();
  });
});
