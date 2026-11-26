import { describe, expect, it } from 'vitest';
import {
  PAGE_SIZE,
  inScope,
  nextBatch,
  pageCount,
  parseScope,
  scopeKey,
  scopePath,
} from '../../src/lib/wall-batches.ts';

const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

describe('nextBatch', () => {
  it('skips slugs that are already rendered and keeps the order', () => {
    expect(nextBatch(order, new Set(['a', 'c']), 3)).toEqual(['b', 'd', 'e']);
  });

  it('takes slugs from anywhere in the order, not only after the last rendered one', () => {
    expect(nextBatch(order, new Set(['b', 'e']), 4)).toEqual(['a', 'c', 'd', 'f']);
  });

  it('returns fewer slugs at the end of the order', () => {
    expect(nextBatch(order, new Set(['a', 'b', 'c', 'd', 'e']), 3)).toEqual(['f', 'g']);
  });

  it('returns nothing when every slug is rendered', () => {
    expect(nextBatch(order, new Set(order), 3)).toEqual([]);
  });

  it('takes PAGE_SIZE slugs by default', () => {
    const many = Array.from({ length: 300 }, (_, i) => `w${i}`);
    const batch = nextBatch(many, new Set());
    expect(batch).toHaveLength(PAGE_SIZE);
    expect(batch[0]).toBe('w0');
    expect(batch.at(-1)).toBe(`w${PAGE_SIZE - 1}`);
  });
});

describe('pageCount', () => {
  it('is 1 for an empty list, so every listing has a first page', () => {
    expect(pageCount(0)).toBe(1);
  });

  it('starts a new page after every PAGE_SIZE items', () => {
    expect(PAGE_SIZE).toBe(120);
    expect(pageCount(120)).toBe(1);
    expect(pageCount(121)).toBe(2);
    expect(pageCount(347)).toBe(3);
  });

  it('accepts another page size', () => {
    expect(pageCount(10, 3)).toBe(4);
  });
});

describe('wall scopes', () => {
  it('round-trips through the data-scope attribute', () => {
    expect(scopeKey({ kind: 'all' })).toBe('all');
    expect(scopeKey({ kind: 'tag', tag: 'nord' })).toBe('tag:nord');
    expect(parseScope('all')).toEqual({ kind: 'all' });
    expect(parseScope('tag:nord')).toEqual({ kind: 'tag', tag: 'nord' });
  });

  it('does not recognise anything else', () => {
    expect(parseScope('')).toBeNull();
    expect(parseScope('tag:')).toBeNull();
    expect(parseScope('source:rose-pine')).toBeNull();
  });

  it('names the first page of each scope', () => {
    expect(scopePath({ kind: 'all' })).toBe('/');
    expect(scopePath({ kind: 'tag', tag: 'pixel-art' })).toBe('/tags/pixel-art/');
  });

  it('keeps every wallpaper in "all" and only tagged ones in a tag', () => {
    const nord = { tags: ['nord', 'landscape'] };
    const city = { tags: ['city'] };
    expect(inScope(nord, { kind: 'all' })).toBe(true);
    expect(inScope(city, { kind: 'all' })).toBe(true);
    expect(inScope(nord, { kind: 'tag', tag: 'nord' })).toBe(true);
    expect(inScope(city, { kind: 'tag', tag: 'nord' })).toBe(false);
  });
});
