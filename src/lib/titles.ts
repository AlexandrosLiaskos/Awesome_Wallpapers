const DROPPED = new Set(['wallhaven', 'wallpaper', 'wall', 'img', 'image', 'unsplash']);
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

function isNoise(token: string): boolean {
  return /^\d+$/.test(token) || /^\d+x\d+$/i.test(token) || DROPPED.has(token.toLowerCase());
}

/** Random-looking ids: letters mixed with digits, no vowel, or capitals inside the word ("CoA"). */
function isGibberish(token: string): boolean {
  return (
    (/[a-z]/i.test(token) && /\d/.test(token)) ||
    !/[aeiouy]/i.test(token) ||
    /[a-z][A-Z]/.test(token)
  );
}

function capitalise(word: string, first: boolean): string {
  if (/^[A-Z]{2,4}$/.test(word)) return word;
  const lower = word.toLowerCase();
  if (!first && SMALL_WORDS.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Readable title from a file path, or null when the name says nothing (hashes, camera counters). */
export function titleFromPath(path: string): string | null {
  const base = path.split(/[\\/]/).pop() ?? '';
  const name = base.replace(/\.[A-Za-z0-9]{1,5}$/, '');
  // Dashes of any kind are separators so a title never carries an em dash.
  const tokens = name.split(/[\s_.\-–—]+/).filter((t) => t && !isNoise(t));
  if (tokens.length === 0 || tokens.every(isGibberish)) return null;
  return tokens.map((t, i) => capitalise(t, i === 0)).join(' ');
}

/** Title for a wallpaper whose file name is meaningless: its tags, plus a number to keep titles apart. */
export function fallbackTitle(tags: string[], labels: Record<string, string>, n: number): string {
  return [...tags.map((t) => labels[t] ?? t), String(n)].join(' ');
}
