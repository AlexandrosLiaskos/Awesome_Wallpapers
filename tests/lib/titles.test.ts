import { describe, expect, it } from 'vitest';
import { fallbackTitle, titleFromPath } from '../../src/lib/titles';

describe('titleFromPath', () => {
  it('title-cases words from underscores', () => {
    expect(titleFromPath('cyberpunk_car.png')).toBe('Cyberpunk Car');
  });

  it('drops a trailing resolution', () => {
    expect(titleFromPath('Nepal_5160x2160.png')).toBe('Nepal');
  });

  it('keeps small words lower case except at the start', () => {
    expect(titleFromPath('a_cartoon_of_a_house_on_a_cliff.png')).toBe('A Cartoon of a House on a Cliff');
    expect(titleFromPath('the-last-of-us.jpg')).toBe('The Last of Us');
  });

  it('uses only the base name, not the folders', () => {
    expect(titleFromPath('wallpapers/forest/misty_pines.webp')).toBe('Misty Pines');
    expect(titleFromPath(String.raw`wallpapers\forest\misty_pines.webp`)).toBe('Misty Pines');
  });

  it('handles upper-case extensions and mixed separators', () => {
    expect(titleFromPath('Dark.Forest-night  sky.JPG')).toBe('Dark Forest Night Sky');
  });

  it('keeps short all-capital words', () => {
    expect(titleFromPath('NYC_skyline.png')).toBe('NYC Skyline');
  });

  it('drops digits and filler tokens', () => {
    expect(titleFromPath('wallpaper_1920x1080_mountain_2.png')).toBe('Mountain');
    expect(titleFromPath('unsplash-lake-image-04.jpg')).toBe('Lake');
  });

  it('treats brackets and commas as separators', () => {
    expect(titleFromPath('forest (3).png')).toBe('Forest');
    expect(titleFromPath('lake[2],pines.png')).toBe('Lake Pines');
  });

  it('keeps non-Latin names', () => {
    expect(titleFromPath('θάλασσα.jpg')).toBe('Θάλασσα');
  });

  it('drops id-like tokens next to real words', () => {
    expect(titleFromPath('forest_a8f3k2.jpg')).toBe('Forest');
    expect(titleFromPath('photo-1506905925346-21bda4d32df4.jpg')).toBeNull();
  });

  it('never produces an em dash', () => {
    expect(titleFromPath('sunset—beach.png')).toBe('Sunset Beach');
  });

  it.each(['wallhaven-x67oxo.png', 'Z5hj_CoA.png', 'uj21s0by4v271.jpg', 'IMG_2034.jpg'])(
    'returns null for %s',
    (path) => {
      expect(titleFromPath(path)).toBeNull();
    },
  );

  it('returns null when nothing is left after dropping tokens', () => {
    expect(titleFromPath('wallpaper_5160x2160.png')).toBeNull();
    expect(titleFromPath('.png')).toBeNull();
  });
});

describe('fallbackTitle', () => {
  const labels = { nord: 'Nord', forest: 'Forest', 'tokyo-night': 'Tokyo Night' };

  it('joins tag labels and the number', () => {
    expect(fallbackTitle(['nord', 'forest'], labels, 3)).toBe('Nord Forest 3');
    expect(fallbackTitle(['tokyo-night', 'nord'], labels, 12)).toBe('Tokyo Night Nord 12');
  });

  it('falls back to the slug when a label is missing', () => {
    expect(fallbackTitle(['nord', 'mystery'], labels, 1)).toBe('Nord mystery 1');
  });
});
