// Contact sheets for the review pull request: the files a sync proposes, small enough to look at
// together and to attach to a comment, each with its number, title and tags.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';

export interface SheetCell {
  /** Any image sharp reads; the media step's preview of the file. */
  image: Buffer;
  title: string;
  tags: string[];
  /** A third line, for what the reviewer must do (held, changed) and the machine's hints. */
  note?: string;
}

const COLUMNS = 4;
const ROWS = 6;
export const PER_SHEET = COLUMNS * ROWS;

const WIDTH = 1600;
const CELL_WIDTH = WIDTH / COLUMNS;
const PAD = 8;
const PICTURE = { width: CELL_WIDTH - 2 * PAD, height: 216 };
const LINE = 19;
const CELL_HEIGHT = PAD + PICTURE.height + 6 + 3 * LINE + PAD;
const BACKGROUND = '#16181a';
// Characters that fit on a line at these sizes, with a little room to spare.
const TITLE_CHARS = 42;
const TEXT_CHARS = 48;

/**
 * Characters XML does not allow, which would stop the whole sheet from being drawn: control
 * characters other than tab and line breaks, U+FFFE and U+FFFF, and halves of a surrogate pair on
 * their own (as cutting a title short can leave).
 */
const NOT_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function escape(text: string): string {
  return text.replace(NOT_XML, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fit(text: string, chars: number): string {
  return escape(text.length <= chars ? text : `${text.slice(0, chars - 3)}...`);
}

/** The labels of one sheet as SVG. A generic font family, so it renders wherever sharp runs, the Ubuntu runner included. */
function labels(cells: SheetCell[], first: number, height: number): Buffer {
  const lines = cells.map((cell, i) => {
    const x = (i % COLUMNS) * CELL_WIDTH + PAD;
    const y = Math.floor(i / COLUMNS) * CELL_HEIGHT + PAD + PICTURE.height + 6 + LINE - 4;
    const note = cell.note ? `<text x="${x}" y="${y + 2 * LINE}" font-size="13" fill="#f0b060">${fit(cell.note, TEXT_CHARS)}</text>` : '';
    return (
      `<text x="${x}" y="${y}" font-size="15" font-weight="bold" fill="#f2f2f2">${fit(`${first + i}. ${cell.title}`, TITLE_CHARS)}</text>` +
      `<text x="${x}" y="${y + LINE}" font-size="13" fill="#9cc4e4">${fit(cell.tags.join(', ') || 'no tags', TEXT_CHARS)}</text>` +
      note
    );
  });
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" font-family="sans-serif">${lines.join('')}</svg>`,
  );
}

/** One sheet of up to 24 cells, numbered from `first`, as JPEG. */
async function draw(cells: SheetCell[], first: number): Promise<Buffer> {
  const height = Math.ceil(cells.length / COLUMNS) * CELL_HEIGHT;
  const pictures = await Promise.all(
    cells.map(async (cell, i) => ({
      input: await sharp(cell.image)
        .resize(PICTURE.width, PICTURE.height, { fit: 'contain', background: '#0a0d0c' })
        .toBuffer(),
      left: (i % COLUMNS) * CELL_WIDTH + PAD,
      top: Math.floor(i / COLUMNS) * CELL_HEIGHT + PAD,
    })),
  );
  return sharp({ create: { width: WIDTH, height, channels: 3, background: BACKGROUND } })
    .composite([...pictures, { input: labels(cells, first, height), left: 0, top: 0 }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/**
 * Draws one cell the way a sheet draws it, without writing anything; throws when it cannot be
 * drawn. Sync tries each file's cell, so a file that would stop its whole sheet is caught alone.
 */
export async function drawCell(cell: SheetCell): Promise<void> {
  await draw([cell], 1);
}

/**
 * Draws the cells on JPEG sheets of up to 24, numbered from 1 across the sheets, and writes them
 * to `<out>-01.jpg`, `<out>-02.jpg` and so on. Returns the paths written; nothing for no cells.
 */
export async function contactSheet(entries: SheetCell[], out: string): Promise<string[]> {
  const written: string[] = [];
  if (entries.length > 0) await mkdir(dirname(out), { recursive: true });
  for (let start = 0; start < entries.length; start += PER_SHEET) {
    const path = `${out}-${String(start / PER_SHEET + 1).padStart(2, '0')}.jpg`;
    await writeFile(path, await draw(entries.slice(start, start + PER_SHEET), start + 1));
    written.push(path);
  }
  return written;
}
