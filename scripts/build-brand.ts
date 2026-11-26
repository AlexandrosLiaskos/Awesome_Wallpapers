// Draws the two images that represent the project on GitHub, from the
// collection itself:
//
//   .github/readme-hero.jpg      the collage at the top of the README
//   .github/social-preview.png   the card shown when the repository is shared
//                                (uploaded by hand in the repository settings)
//
// Run after `npm run media`, and again when the featured wallpapers change:
//
//   node scripts/build-brand.ts

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { Wallpaper } from '../src/lib/types.ts';
import { woffToSfnt } from './lib/woff.ts';

const BACKGROUND = '#0a0d0c';
const ACCENT = '#5eead4';
const TEXT = '#e9efed';
const MUTED = '#a3b0ac';
const FONTS = 'node_modules/@fontsource';

/** Unpacks one of the site's WOFF fonts into a file the text renderer can load. */
async function font(woff: string): Promise<string> {
  const path = join('.cache/fonts', woff.split('/').pop()!.replace(/\.woff$/, '.ttf'));
  await mkdir('.cache/fonts', { recursive: true });
  await writeFile(path, woffToSfnt(await readFile(join(FONTS, woff))));
  return path;
}

const SERIF = await font('newsreader/files/newsreader-latin-400-normal.woff');
const SERIF_ITALIC = await font('newsreader/files/newsreader-latin-400-italic.woff');
const MONO = await font('ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff');

const catalog = JSON.parse(await readFile('src/generated/catalog.json', 'utf8')) as Wallpaper[];
const picks = catalog.filter((wallpaper) => wallpaper.featured && wallpaper.shape === 'desktop').slice(0, 8);
if (picks.length < 8) throw new Error('The collage needs eight featured desktop wallpapers.');

/** A 4×2 grid of the first eight featured wallpapers. */
async function collage(width: number, height: number, gap: number): Promise<Buffer> {
  const tile = { width: Math.floor((width - gap * 3) / 4), height: Math.floor((height - gap) / 2) };
  const tiles = await Promise.all(
    picks.map(async (wallpaper, index) => ({
      // Read into memory first: libvips keeps files it opens by path locked on Windows.
      input: await sharp(await readFile(join('public/m/p', `${wallpaper.slug}.webp`)))
        .resize(tile.width, tile.height, { fit: 'cover', position: 'attention' })
        .toBuffer(),
      left: (index % 4) * (tile.width + gap),
      top: Math.floor(index / 4) * (tile.height + gap),
    })),
  );
  return sharp({ create: { width, height, channels: 3, background: BACKGROUND } })
    .composite(tiles)
    .png()
    .toBuffer();
}

/** A line of text as an image. `markup` may use Pango tags such as <i> and <span foreground>. */
async function text(markup: string, fontfile: string, family: string, size: number, colour: string): Promise<Buffer> {
  return sharp({
    text: {
      text: `<span foreground="${colour}">${markup}</span>`,
      font: `${family} ${size}`,
      fontfile,
      rgba: true,
      dpi: 72,
    },
  })
    .png()
    .toBuffer();
}

async function readmeHero(): Promise<void> {
  await sharp(await collage(1600, 640, 6))
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile('.github/readme-hero.jpg');
}

async function socialPreview(): Promise<void> {
  const WIDTH = 1280;
  const HEIGHT = 640;
  const dim = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">` +
      `<rect width="100%" height="100%" fill="#060908" fill-opacity="0.72"/></svg>`,
  );

  // Both words are set as one line so they share a baseline. The italic face
  // is registered by rendering with it once; the line itself names the upright file.
  await text('i', SERIF_ITALIC, 'Newsreader', 12, TEXT);
  const wordmark = await text(`Awesome <span foreground="${MUTED}"><i>Wallpapers</i></span>`, SERIF, 'Newsreader', 104, TEXT);
  const tagline = `${catalog.length} aesthetic wallpapers  ·  searchable  ·  free to download`;
  const line = await text(tagline, MONO, 'IBM Plex Mono', 26, MUTED);
  const [w, l] = await Promise.all([wordmark, line].map((image) => sharp(image).metadata()));

  // A small square in the accent colour stands in front of the name, as on the site.
  const MARK = 26;
  const SPACE = 30;
  const left = Math.round((WIDTH - (MARK + SPACE + w.width)) / 2);
  const top = 226;
  const mark = await sharp({ create: { width: MARK, height: MARK, channels: 4, background: ACCENT } })
    .png()
    .toBuffer();

  await sharp(await collage(WIDTH, HEIGHT, 0))
    .composite([
      { input: dim, left: 0, top: 0 },
      { input: mark, left, top: top + 46 },
      { input: wordmark, left: left + MARK + SPACE, top },
      { input: line, left: Math.round((WIDTH - l.width) / 2), top: top + w.height + 40 },
    ])
    .png({ compressionLevel: 9 })
    .toFile('.github/social-preview.png');
}

/** PNG copies of public/favicon.svg, for browsers, phones and search engines that do not use the SVG. */
async function icons(): Promise<void> {
  const svg = await readFile('public/favicon.svg');
  const sizes: [file: string, size: number][] = [
    ['favicon-48.png', 48],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ];
  for (const [file, size] of sizes) {
    await sharp(svg, { density: Math.ceil((72 * size) / 32) })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(join('public', file));
  }
}

await readmeHero();
await socialPreview();
await icons();
console.log('brand: wrote .github/readme-hero.jpg, .github/social-preview.png and the PNG icons in public/');
