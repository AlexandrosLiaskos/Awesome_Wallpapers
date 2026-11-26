import { describe, expect, it } from 'vitest';
import { chooseThreshold, similarities, subjectPrompts, suggestTags } from '../../src/lib/suggest.ts';
import type { Tag } from '../../src/lib/types.ts';

describe('chooseThreshold', () => {
  it('returns the boundary of a separable set', () => {
    expect(chooseThreshold([0.1, 0.25, 0.3, 0.42, 0.5], [false, false, true, true, true])).toBe(0.3);
  });

  it('returns null when no threshold reaches the precision', () => {
    expect(chooseThreshold([0.1, 0.2, 0.3, 0.4], [true, false, true, false])).toBeNull();
  });

  it('returns null when nothing is tagged', () => {
    expect(chooseThreshold([0.1, 0.2, 0.3], [false, false, false])).toBeNull();
  });

  // Positives at 0.4 and 0.6 to 1.0, a negative at 0.5: going down to 0.4 costs precision
  // (6 of 7) but finds every positive, so its F1 (0.923) beats 0.6 (1.0 precision, F1 0.909).
  const scores = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const truth = [false, false, false, true, false, true, true, true, true, true];

  it('takes the best F1 among the thresholds that keep the precision', () => {
    expect(chooseThreshold(scores, truth)).toBe(0.4);
  });

  it('honours a stricter minimum precision', () => {
    expect(chooseThreshold(scores, truth, 0.9)).toBe(0.6);
  });

  it('treats equal scores as one step', () => {
    // At 0.5 both the positive and the negative come in together, which drops precision to 2 of 3.
    expect(chooseThreshold([0.5, 0.5, 0.9], [true, false, true])).toBe(0.9);
  });

  it('rejects mismatched inputs', () => {
    expect(() => chooseThreshold([0.1, 0.2], [true])).toThrow();
  });
});

describe('suggestTags', () => {
  it('drops tags with a null threshold or a similarity below it, highest margin first', () => {
    const similarity = { forest: 0.3, water: 0.28, sky: 0.35, night: 0.4 };
    const thresholds = { forest: 0.25, water: 0.2, sky: null, night: 0.41 };
    expect(suggestTags(similarity, thresholds)).toEqual(['water', 'forest']);
  });

  it('keeps a similarity equal to its threshold, since the threshold is the lowest score it accepted', () => {
    expect(suggestTags({ space: 0.27 }, { space: 0.27 })).toEqual(['space']);
  });

  it('ignores tags it has no similarity for', () => {
    expect(suggestTags({ city: 0.3 }, { city: 0.2, cars: 0.1 })).toEqual(['city']);
  });

  const similarity = { a: 0.31, b: 0.32, c: 0.33, d: 0.34, e: 0.35, f: 0.36, g: 0.37 };
  const thresholds = { a: 0.3, b: 0.3, c: 0.3, d: 0.3, e: 0.3, f: 0.3, g: 0.3 };

  it('caps at five by default', () => {
    expect(suggestTags(similarity, thresholds)).toEqual(['g', 'f', 'e', 'd', 'c']);
  });

  it('caps at max', () => {
    expect(suggestTags(similarity, thresholds, 2)).toEqual(['g', 'f']);
  });
});

const tag = (slug: string, label: string, kind: Tag['kind'] = 'subject'): Tag => ({ slug, label, kind, description: '' });

describe('subjectPrompts', () => {
  const tags = [tag('nord', 'Nord', 'palette'), tag('movies-tv', 'Movies & TV'), tag('dark', 'Dark')];

  it('prompts each subject tag by its label and leaves palettes out', () => {
    expect(subjectPrompts(tags)).toEqual({ 'movies-tv': 'a Movies & TV wallpaper', dark: 'a Dark wallpaper' });
  });

  it('uses an override where there is one', () => {
    expect(subjectPrompts(tags, { dark: 'a mostly black wallpaper' }).dark).toBe('a mostly black wallpaper');
  });

  it('rejects an override for a palette or an unknown tag', () => {
    expect(() => subjectPrompts(tags, { nord: 'a nord wallpaper' })).toThrow(/nord/);
    expect(() => subjectPrompts(tags, { boats: 'a boat' })).toThrow(/boats/);
  });
});

describe('similarities', () => {
  it('gives the cosine similarity with each text, whatever the vector lengths', () => {
    const image = Float32Array.from([3, 0]);
    const result = similarities(image, { same: Float32Array.from([2, 0]), across: Float32Array.from([0, 5]), between: Float32Array.from([1, 1]) });
    expect(result.same).toBeCloseTo(1);
    expect(result.across).toBeCloseTo(0);
    expect(result.between).toBeCloseTo(Math.SQRT1_2);
  });
});
