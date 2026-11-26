/** The palettes that can be assigned by measurement. */
export type PaletteSlug = 'nord' | 'gruvbox' | 'catppuccin' | 'tokyo-night' | 'everforest' | 'rose-pine';

/** Default CIE76 distance within which a pixel counts as a palette colour (the calibration tries the grid below). */
export const MAX_DELTA_E = 12;

/** Distances the calibration tries for each palette. */
export const DELTA_E_GRID = [4, 6, 8, 12];

/**
 * Pixels and palette colours with CIELAB chroma below this are near-neutral. Every scheme has dark
 * greys, so they say nothing about which scheme an image uses and are left out on both sides.
 */
export const MIN_CHROMA = 8;

/** Below this share of chromatic pixels an image carries no palette evidence, and every score is 0. */
export const MIN_CHROMATIC_SHARE = 0.05;

/** A calibrated threshold needs at least this many hand-tagged wallpapers at or above it. */
export const MIN_TRUE_POSITIVES = 3;

/** A wallpaper carries at most this many palette tags. */
export const MAX_PALETTE_TAGS = 2;

/** What the calibration stores per palette in data/tagger.json; null means it never reached the precision. */
export type PaletteSetting = { deltaE: number; threshold: number } | null;

/**
 * Each scheme's own colour list, copied from its official source (named above each list)
 * and written out here so that measuring needs no extra dependency.
 */
export const PALETTES: Record<PaletteSlug, string[]> = {
  // nord0 to nord15, https://www.nordtheme.com/docs/colors-and-palettes (nordtheme/nord, src/nord.css).
  nord: [
    '#2e3440', '#3b4252', '#434c5e', '#4c566a', '#d8dee9', '#e5e9f0',
    '#eceff4', '#8fbcbb', '#88c0d0', '#81a1c1', '#5e81ac', '#bf616a',
    '#d08770', '#ebcb8b', '#a3be8c', '#b48ead',
  ],
  // Gruvbox dark: dark0..dark4, gray, light0..light4, bright and neutral accents, from colors/gruvbox.vim in https://github.com/morhetz/gruvbox
  // (the faded accents are the light theme's foregrounds and are left out).
  gruvbox: [
    '#1d2021', '#282828', '#32302f', '#3c3836', '#504945', '#665c54',
    '#7c6f64', '#f9f5d7', '#fbf1c7', '#f2e5bc', '#ebdbb2', '#d5c4a1',
    '#bdae93', '#a89984', '#fb4934', '#b8bb26', '#fabd2f', '#83a598',
    '#d3869b', '#8ec07c', '#fe8019', '#cc241d', '#98971a', '#d79921',
    '#458588', '#b16286', '#689d6a', '#d65d0e', '#928374',
  ],
  // All four flavours (Latte, Frappé, Macchiato, Mocha), 26 colours each, from palette.json in https://github.com/catppuccin/palette.
  // Colours shared between flavours appear once.
  catppuccin: [
    '#dc8a78', '#dd7878', '#ea76cb', '#8839ef', '#d20f39', '#e64553',
    '#fe640b', '#df8e1d', '#40a02b', '#179299', '#04a5e5', '#209fb5',
    '#1e66f5', '#7287fd', '#4c4f69', '#5c5f77', '#6c6f85', '#7c7f93',
    '#8c8fa1', '#9ca0b0', '#acb0be', '#bcc0cc', '#ccd0da', '#eff1f5',
    '#e6e9ef', '#dce0e8', '#f2d5cf', '#eebebe', '#f4b8e4', '#ca9ee6',
    '#e78284', '#ea999c', '#ef9f76', '#e5c890', '#a6d189', '#81c8be',
    '#99d1db', '#85c1dc', '#8caaee', '#babbf1', '#c6d0f5', '#b5bfe2',
    '#a5adce', '#949cbb', '#838ba7', '#737994', '#626880', '#51576d',
    '#414559', '#303446', '#292c3c', '#232634', '#f4dbd6', '#f0c6c6',
    '#f5bde6', '#c6a0f6', '#ed8796', '#ee99a0', '#f5a97f', '#eed49f',
    '#a6da95', '#8bd5ca', '#91d7e3', '#7dc4e4', '#8aadf4', '#b7bdf8',
    '#cad3f5', '#b8c0e0', '#a5adcb', '#939ab7', '#8087a2', '#6e738d',
    '#5b6078', '#494d64', '#363a4f', '#24273a', '#1e2030', '#181926',
    '#f5e0dc', '#f2cdcd', '#f5c2e7', '#cba6f7', '#f38ba8', '#eba0ac',
    '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5', '#89dceb', '#74c7ec',
    '#89b4fa', '#b4befe', '#cdd6f4', '#bac2de', '#a6adc8', '#9399b2',
    '#7f849c', '#6c7086', '#585b70', '#45475a', '#313244', '#1e1e2e',
    '#181825', '#11111b',
  ],
  // The "night" style, extras/lua/tokyonight_night.lua in https://github.com/folke/tokyonight.nvim.
  'tokyo-night': [
    '#1a1b26', '#16161e', '#0c0e14', '#292e42', '#3d59a1', '#283457',
    '#15161e', '#7aa2f7', '#2ac3de', '#0db9d7', '#89ddff', '#b4f9f8',
    '#394b70', '#27a1b9', '#565f89', '#7dcfff', '#545c7e', '#737aa2',
    '#db4b4b', '#c0caf5', '#a9b1d6', '#3b4261', '#9ece6a', '#73daca',
    '#41a6b5', '#1abc9c', '#bb9af7', '#ff007c', '#ff9e64', '#9d7cd8',
    '#e0af68', '#f7768e', '#414868',
  ],
  // Dark, medium contrast: backgrounds and foregrounds from palette.md in https://github.com/sainnhe/everforest.
  everforest: [
    '#232a2e', '#2d353b', '#343f44', '#3d484d', '#475258', '#4f585e',
    '#56635f', '#543a48', '#514045', '#4d4c43', '#425047', '#3a515d',
    '#4a444e', '#d3c6aa', '#e67e80', '#e69875', '#dbbc7f', '#a7c080',
    '#83c092', '#7fbbb3', '#d699b6', '#7a8478', '#859289', '#9da9a0',
  ],
  // Main, Moon and Dawn, palette.json in https://github.com/rose-pine/palette.
  'rose-pine': [
    '#191724', '#1f1d2e', '#26233a', '#6e6a86', '#908caa', '#e0def4',
    '#eb6f92', '#f6c177', '#ebbcba', '#31748f', '#9ccfd8', '#c4a7e7',
    '#232136', '#2a273f', '#393552', '#ea9a97', '#3e8fb0', '#faf4ed',
    '#fffaf3', '#f2e9e1', '#9893a5', '#797593', '#464261', '#b4637a',
    '#ea9d34', '#d7827e', '#286983', '#56949f', '#907aa9',
  ],
};

type Lab = [number, number, number];

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function pivot(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
}

/** sRGB (0 to 255 per channel) to CIELAB, D65 white point. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = linear(r);
  const lg = linear(g);
  const lb = linear(b);
  const fx = pivot((0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047);
  const fy = pivot(0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb);
  const fz = pivot((0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function hexToLab(hex: string): Lab {
  return rgbToLab(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
}

const chromaOf = ([, a, b]: Lab): number => Math.hypot(a, b);

// Palettes are module-level constants, so converting each once is enough.
const labCache = new WeakMap<string[], Lab[]>();

function chromaticLabsOf(palette: string[]): Lab[] {
  let labs = labCache.get(palette);
  if (!labs) {
    labs = palette.map(hexToLab).filter((lab) => chromaOf(lab) >= MIN_CHROMA);
    labCache.set(palette, labs);
  }
  return labs;
}

/**
 * Among the chromatic pixels (packed r, g, b bytes), the share within deltaE of a chromatic
 * colour of the palette. 0 when fewer than MIN_CHROMATIC_SHARE of the pixels are chromatic.
 */
export function paletteCoverage(rgb: Uint8Array, palette: string[], deltaE = MAX_DELTA_E): number {
  const pixelCount = Math.floor(rgb.length / 3);
  if (pixelCount === 0) return 0;

  const labs = chromaticLabsOf(palette);
  const limit = deltaE * deltaE;
  // Flat artwork repeats colours a lot, so each distinct one is measured once: 0 neutral, 1 miss, 2 hit.
  const seen = new Map<number, number>();
  let chromatic = 0;
  let hits = 0;
  for (let i = 0; i < pixelCount * 3; i += 3) {
    const key = (rgb[i] << 16) | (rgb[i + 1] << 8) | rgb[i + 2];
    let kind = seen.get(key);
    if (kind === undefined) {
      const lab = rgbToLab(rgb[i], rgb[i + 1], rgb[i + 2]);
      if (chromaOf(lab) < MIN_CHROMA) kind = 0;
      else kind = labs.some(([pl, pa, pb]) => (lab[0] - pl) ** 2 + (lab[1] - pa) ** 2 + (lab[2] - pb) ** 2 <= limit) ? 2 : 1;
      seen.set(key, kind);
    }
    if (kind > 0) chromatic += 1;
    if (kind === 2) hits += 1;
  }
  if (chromatic / pixelCount < MIN_CHROMATIC_SHARE) return 0;
  return hits / chromatic;
}

/**
 * Palette tags for an image, highest coverage first, at most two. A palette whose setting is
 * null or missing never matches: the calibration could not make it trustworthy.
 */
export function paletteTags(rgb: Uint8Array, settings: Record<string, PaletteSetting | undefined>): string[] {
  const scored: { slug: string; coverage: number }[] = [];
  for (const slug of Object.keys(PALETTES) as PaletteSlug[]) {
    const setting = settings[slug];
    if (!setting) continue;
    const coverage = paletteCoverage(rgb, PALETTES[slug], setting.deltaE);
    if (coverage >= setting.threshold) scored.push({ slug, coverage });
  }
  scored.sort((a, b) => b.coverage - a.coverage);
  return scored.slice(0, MAX_PALETTE_TAGS).map((item) => item.slug);
}
