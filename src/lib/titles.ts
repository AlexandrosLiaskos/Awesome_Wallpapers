// "ign" is the prefix ImageGoNord gives the files it converts (nordic-wallpapers names most of its files so).
const DROPPED = new Set(['wallhaven', 'wallpaper', 'wall', 'img', 'image', 'unsplash', 'photo', 'ign']);
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

function isNoise(token: string): boolean {
  return /^\d+$/.test(token) || /^\d+x\d+$/i.test(token) || DROPPED.has(token.toLowerCase());
}

/**
 * Random-looking ids: letters mixed with digits, no vowel, or capitals inside the word ("CoA").
 * The vowel test only applies to ASCII words (so Greek or Cyrillic names survive) and spares
 * short all-capital words such as NYC.
 */
function isGibberish(token: string): boolean {
  return (
    (/[a-z]/i.test(token) && /\d/.test(token)) ||
    (/^[\u0000-\u007f]+$/.test(token) && token.length >= 3 && !/^[A-Z]{2,4}$/.test(token) && !/[aeiouy]/i.test(token)) ||
    (/[a-z][A-Z]/.test(token) && token.length <= 4)
  );
}

function capitalise(word: string, first: boolean): string {
  // Short all-capital words (NYC) and mixed-case brands (McLaren, iPhone) keep their own casing.
  if (/^[A-Z]{2,4}$/.test(word) || /[a-z][A-Z]/.test(word)) return word;
  const lower = word.toLowerCase();
  if (!first && SMALL_WORDS.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Readable title from a file path, or null when the name says nothing (hashes, camera counters). */
export function titleFromPath(path: string): string | null {
  const base = path.split(/[\\/]/).pop() ?? '';
  const name = base.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  // Dashes of any kind are separators so a title never carries an em dash.
  const tokens = name.split(/[\s_.,()[\]\-\u2013\u2014]+/).filter((t) => t && !isNoise(t) && !isGibberish(t));
  if (tokens.length === 0) return null;
  return tokens.map((t, i) => capitalise(t, i === 0)).join(' ');
}

/** Title for a wallpaper whose file name is meaningless: its tags, plus a number to keep titles apart. */
export function fallbackTitle(tags: string[], labels: Record<string, string>, n: number): string {
  return [...tags.map((t) => labels[t] ?? t), String(n)].join(' ');
}
