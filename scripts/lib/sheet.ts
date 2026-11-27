// Contact sheets for the review pull request: the files a sync proposes, small enough to look at
// together and to attach to a comment, each with its number, title and tags.

import { mkdir } from 'node:fs/promises';
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

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

/**
 * Draws the cells on JPEG sheets of up to 24, numbered from 1 across the sheets, and writes them
 * to `<out>-01.jpg`, `<out>-02.jpg` and so on. Returns the paths written; nothing for no cells.
 */
export async function contactSheet(entries: SheetCell[], out: string): Promise<string[]> {
  const written: string[] = [];
  if (entries.length > 0) await mkdir(dirname(out), { recursive: true });
  for (let start = 0; start < entries.length; start += PER_SHEET) {
    const cells = entries.slice(start, start + PER_SHEET);
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
    const path = `${out}-${String(start / PER_SHEET + 1).padStart(2, '0')}.jpg`;
    await sharp({ create: { width: WIDTH, height, channels: 3, background: BACKGROUND } })
      .composite([...pictures, { input: labels(cells, start + 1, height), left: 0, top: 0 }])
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path);
    written.push(path);
  }
  return written;
}
