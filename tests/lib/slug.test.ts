import { describe, expect, it } from 'vitest';
import { rawUrl, toSlug } from '../../src/lib/slug.ts';

describe('toSlug', () => {
  it('lower-cases and replaces underscores', () => {
    expect(toSlug('Luffy_from_One_Piece_5160x2160.jpeg')).toBe('luffy-from-one-piece-5160x2160');
  });

  it('keeps letters and digits of opaque names', () => {
    expect(toSlug('Z5hj_CoA.png')).toBe('z5hj-coa');
  });

  it('collapses spaces and symbols into single hyphens', () => {
    expect(toSlug('a  b&c.JPG')).toBe('a-b-c');
  });

  it('strips accents instead of dropping the letter', () => {
    expect(toSlug('Café_Señor.png')).toBe('cafe-senor');
  });

  it('never starts or ends with a hyphen', () => {
    expect(toSlug('_wave_.png')).toBe('wave');
  });
});

describe('rawUrl', () => {
  it('percent-encodes spaces and ampersands', () => {
    expect(rawUrl('a b&c.jpg')).toBe(
      'https://raw.githubusercontent.com/AlexandrosLiaskos/Awesome_Wallpapers/main/images/a%20b%26c.jpg',
    );
  });
});
