// The same image is often in more than one collection. It is shown once,
// crediting every collection that has it, and downloads as its largest copy.
//
// The 64-bit fingerprint only shortlists pairs: it does not see a small logo in
// the middle of a plain background (among our own wallpapers it pairs up 18
// that differ, Tux and Windows on the same pink). A pair is a copy only when
// the dominant colours and the aspect ratios match too, and a comparison of the
// pictures themselves (given by the caller) agrees. A recolouring of one
// artwork, a Nord and a Gruvbox version, fails on the dominant colour, or on
// the picture comparison when the two themes' backgrounds are near-equal greys.
//
// Only copies in different collections merge, and a group takes in at most
// one copy per collection: a collection's own files are left as its maintainer
// arranged them, whether or not another collection has the image, and two own
// wallpapers never merge.

import type { Wallpaper } from './types.ts';

/** Fingerprints at most this many bits apart may show the same image. */
const MAX_BITS = 6;
/** Swatches at most this far apart in RGB are the same colour. */
const MAX_COLOUR_DISTANCE = 24;
/** Aspect ratios at most this far apart, relative to the wider one. */
const MAX_ASPECT_DIFFERENCE = 0.03;
const HASH = /^[0-9a-f]{16}$/;
const OWN = 'own';

/** Decides whether two shortlisted wallpapers show the same picture. It should not depend on the order. */
export type Confirm = (a: Wallpaper, b: Wallpaper) => Promise<boolean>;

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

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** What the shortlist compares: the hash, the first two swatches, the shape and the collection. */
interface Print extends Halves {
  /** The first swatch, then the second if there is one. */
  swatches: Rgb[];
  ratio: number;
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

function rgbOf(hex: string): Rgb {
  const value = parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function printOf(wallpaper: Wallpaper): Print | undefined {
  if (!wallpaper.palette[0]?.hex || !HASH.test(wallpaper.phash) || !(wallpaper.height > 0)) return undefined;
  return {
    ...halves(wallpaper.phash),
    swatches: wallpaper.palette.slice(0, 2).map((swatch) => rgbOf(swatch.hex)),
    ratio: wallpaper.width / wallpaper.height,
    source: wallpaper.sourceId,
  };
}

const near = (x: Rgb, y: Rgb) => (x.r - y.r) ** 2 + (x.g - y.g) ** 2 + (x.b - y.b) ** 2 <= MAX_COLOUR_DISTANCE ** 2;

/**
 * Whether two wallpapers have the same dominant colours: each one's first swatch
 * is near one of the other's first two. Two colours that cover about as much of
 * a picture can swap places between copies.
 */
function sameColouring(a: Print, b: Print): boolean {
  return b.swatches.some((swatch) => near(a.swatches[0], swatch)) && a.swatches.some((swatch) => near(b.swatches[0], swatch));
}

/** The cheap checks besides the hash; a pair that passes them goes to the picture comparison. */
function alike(a: Print, b: Print): boolean {
  if (a.source === b.source) return false;
  if (Math.abs(a.ratio - b.ratio) > MAX_ASPECT_DIFFERENCE * Math.max(a.ratio, b.ratio)) return false;
  return sameColouring(a, b);
}

/** The wallpapers that share one hash, in the order they are handled. */
interface Group extends Halves {
  members: number[];
  /** Members before this one were handled already and need not be looked at again. */
  next: number;
}

/**
 * The hash cut into its 8 bytes, each keyed by its position. Two hashes at most
 * 6 bits apart differ in at most 6 bytes, so they share at least one key, and
 * only hashes that share a key need comparing.
 */
function keysOf(hash: Halves): number[] {
  const keys: number[] = [];
  for (const [half, word] of [hash.hi, hash.lo].entries()) {
    for (let byte = 0; byte < 4; byte++) {
      keys.push(((half * 4 + byte) << 8) | ((word >>> (24 - byte * 8)) & 255));
    }
  }
  return keys;
}

/** The own entry, as it stays on the site, described by the largest copy's file. */
function ownWithLargest(own: Wallpaper, largest: Wallpaper): Wallpaper {
  const { file, download, width, height, bytes, format, size, aspect, shape, animated } = largest;
  return { ...own, file, download, width, height, bytes, format, size, aspect, shape, animated };
}

const OPEN = 0;
const ABSORBED = 1;
const KEPT = 2;

/**
 * Merges copies of the same image found in different collections.
 *
 * The largest copy (most pixels; on a tie an own wallpaper, then the earlier
 * one) is compared with every lesser copy on the shortlist. A group with an own
 * wallpaper keeps that entry, its page, title, tags and credit, with the
 * download and size of the largest copy; a group without one keeps the largest
 * copy. Either way the kept entry lists the other collections in `alsoIn`, and
 * survivors keep their order. A group takes in at most one copy per
 * collection, the best-ranked one; the others stay as they are.
 */
export async function mergeDuplicates(list: Wallpaper[], confirm: Confirm): Promise<Wallpaper[]> {
  const prints = list.map(printOf);
  const pixels = (index: number) => list[index].width * list[index].height;
  const isOwn = (index: number) => list[index].sourceId === OWN;
  const preferred = list
    .map((_, index) => index)
    .sort((a, b) => pixels(b) - pixels(a) || Number(isOwn(b)) - Number(isOwn(a)) || a - b);
  const rank = new Int32Array(list.length);
  preferred.forEach((index, position) => (rank[index] = position));

  // Plain images often share one hash exactly; grouping them keeps the buckets short.
  const byHash = new Map<string, Group>();
  for (const index of preferred) {
    const print = prints[index];
    if (!print) continue;
    const group = byHash.get(list[index].phash);
    if (group) group.members.push(index);
    else byHash.set(list[index].phash, { hi: print.hi, lo: print.lo, members: [index], next: 0 });
  }
  const groups = [...byHash.values()];
  const buckets = new Map<number, number[]>();
  groups.forEach((group, g) => {
    for (const key of keysOf(group)) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(g);
      else buckets.set(key, [g]);
    }
  });

  const state = new Uint8Array(list.length);
  // Which copy last looked at each group, so a group sharing several keys is looked at once.
  const lastSeen = new Int32Array(groups.length).fill(-1);
  const replaced = new Map<number, Wallpaper>();

  // Copies are handled from the largest down, and each is compared only with
  // lesser ones: every pair is asked about at most once, and a copy never takes
  // in a better one.
  for (const largest of preferred) {
    const print = prints[largest];
    if (state[largest] !== OPEN || !print) continue;
    const candidates: number[] = [];
    for (const key of keysOf(print)) {
      for (const g of buckets.get(key)!) {
        if (lastSeen[g] === largest) continue;
        lastSeen[g] = largest;
        const group = groups[g];
        if (bitsApart(print, group) > MAX_BITS) continue;
        const { members } = group;
        while (group.next < members.length && rank[members[group.next]] <= rank[largest]) group.next++;
        for (let m = group.next; m < members.length; m++) {
          const other = members[m];
          if (state[other] === OPEN && alike(print, prints[other]!)) candidates.push(other);
        }
      }
    }
    if (candidates.length === 0) continue;

    const answers = await Promise.all(candidates.map((other) => confirm(list[largest], list[other])));
    const taken = new Set([list[largest].sourceId]);
    const copies: number[] = [];
    for (const other of candidates.filter((_, i) => answers[i]).sort((a, b) => rank[a] - rank[b])) {
      // A second copy from a collection already in the group stays as it is, open to copies of its own.
      if (taken.has(list[other].sourceId)) continue;
      taken.add(list[other].sourceId);
      copies.push(other);
    }
    if (copies.length === 0) continue;

    // The group holds at most one own wallpaper, own being one collection; if there is one, it stays.
    const kept = [largest, ...copies].find(isOwn) ?? largest;
    const alsoIn = new Set(list[kept].alsoIn);
    for (const member of [largest, ...copies]) {
      if (member === kept) continue;
      state[member] = ABSORBED;
      alsoIn.add(list[member].sourceId);
      for (const id of list[member].alsoIn) alsoIn.add(id);
    }
    state[kept] = KEPT;
    alsoIn.delete(list[kept].sourceId);
    const entry = kept === largest ? list[kept] : ownWithLargest(list[kept], list[largest]);
    replaced.set(kept, { ...entry, alsoIn: [...alsoIn] });
  }

  return list.flatMap((wallpaper, index) => (state[index] === ABSORBED ? [] : [replaced.get(index) ?? wallpaper]));
}
