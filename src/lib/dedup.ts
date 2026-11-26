// The same image is often in more than one collection. It is shown once, as
// its largest copy, crediting every collection that has it. A recolouring of
// one artwork (a Nord and a Gruvbox version) keeps its shapes but not its
// colours, so it needs both the fingerprint and the first swatch to match.
//
// Only copies in different collections are merged. A 64-bit fingerprint does
// not see a small logo in the middle of a plain background, so among our own
// wallpapers it pairs up 18 that differ (Tux and Windows on the same pink); a
// collection's own files are left as its maintainer arranged them.

import type { Wallpaper } from './types.ts';

/** Fingerprints at most this many bits apart show the same image. */
const MAX_BITS = 6;
/** First swatches at most this far apart in RGB are the same colouring. */
const MAX_COLOUR_DISTANCE = 24;
const HASH = /^[0-9a-f]{16}$/;

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

/** A 64-bit hash as two 32-bit halves, which bit operations can handle. */
interface Halves {
  hi: number;
  lo: number;
}

/** What two wallpapers are compared by: the hash, the first swatch and the collection. */
interface Print extends Halves {
  r: number;
  g: number;
  b: number;
  source: string;
}

function halves(hash: string): Halves {
  return { hi: parseInt(hash.slice(0, 8), 16), lo: parseInt(hash.slice(8, 16), 16) };
}

function bitsApart(a: Halves, b: Halves): number {
  return popcount(a.hi ^ b.hi) + popcount(a.lo ^ b.lo);
}

/** How many bits two 16-hex-digit hashes differ in. */
export function hamming(a: string, b: string): number {
  return bitsApart(halves(a), halves(b));
}

function printOf(wallpaper: Wallpaper): Print | undefined {
  const first = wallpaper.palette[0]?.hex;
  if (!first || !HASH.test(wallpaper.phash)) return undefined;
  const value = parseInt(first.slice(1), 16);
  return {
    ...halves(wallpaper.phash),
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
    source: wallpaper.sourceId,
  };
}

function copies(a: Print, b: Print): boolean {
  if (a.source === b.source) return false;
  const colour = (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
  return colour <= MAX_COLOUR_DISTANCE ** 2 && bitsApart(a, b) <= MAX_BITS;
}

/**
 * The hash cut into its 8 bytes, each keyed by its position. Two hashes at most
 * 6 bits apart differ in at most 6 bytes, so they share at least one key, and
 * only wallpapers that share a key need comparing.
 */
function keysOf(print: Print): number[] {
  const keys: number[] = [];
  for (const [half, word] of [print.hi, print.lo].entries()) {
    for (let byte = 0; byte < 4; byte++) {
      keys.push(((half * 4 + byte) << 8) | ((word >>> (24 - byte * 8)) & 255));
    }
  }
  return keys;
}

/**
 * Merges copies of the same image found in different collections. The copy
 * with the most pixels is kept; on a tie an own wallpaper wins, then the one
 * earlier in the list. The kept copy lists the collections of the others in
 * `alsoIn`. Survivors keep their order.
 */
export function mergeDuplicates(list: Wallpaper[]): Wallpaper[] {
  const prints = list.map(printOf);
  const buckets = new Map<number, number[]>();
  prints.forEach((print, index) => {
    if (!print) return;
    for (const key of keysOf(print)) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(index);
      else buckets.set(key, [index]);
    }
  });

  const pixels = (index: number) => list[index].width * list[index].height;
  const own = (index: number) => (list[index].sourceId === 'own' ? 0 : 1);
  const preferred = list.map((_, index) => index).sort((a, b) => pixels(b) - pixels(a) || own(a) - own(b) || a - b);

  const absorbed = new Uint8Array(list.length);
  // Which wallpaper last looked at each candidate, so a pair sharing several keys is compared once.
  const lastSeen = new Int32Array(list.length).fill(-1);
  const merged = new Map<number, Wallpaper>();

  // Every better copy was handled first and, the comparison being symmetric,
  // would already have taken this one in; so whatever it finds is a lesser copy.
  for (const index of preferred) {
    const print = prints[index];
    if (absorbed[index] || !print) continue;
    const found: number[] = [];
    for (const key of keysOf(print)) {
      for (const other of buckets.get(key)!) {
        if (other === index || absorbed[other] || lastSeen[other] === index) continue;
        lastSeen[other] = index;
        if (copies(print, prints[other]!)) found.push(other);
      }
    }
    if (found.length === 0) continue;

    const alsoIn = new Set(list[index].alsoIn);
    for (const other of found.sort((a, b) => a - b)) {
      absorbed[other] = 1;
      alsoIn.add(list[other].sourceId);
      for (const id of list[other].alsoIn) alsoIn.add(id);
    }
    alsoIn.delete(list[index].sourceId);
    merged.set(index, { ...list[index], alsoIn: [...alsoIn] });
  }

  return list.flatMap((wallpaper, index) => (absorbed[index] ? [] : [merged.get(index) ?? wallpaper]));
}
