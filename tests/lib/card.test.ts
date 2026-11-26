import { describe, expect, it } from 'vitest';
import { cardHtml, toCardData, type CardData } from '../../src/lib/card.ts';
import { SITE } from '../../src/lib/site.ts';
import type { Wallpaper } from '../../src/lib/types.ts';

const card: CardData = {
  slug: 'neon-city',
  title: 'Neon City',
  width: 3840,
  height: 2160,
  tags: ['neon', 'city', 'unknown-tag'],
  size: '4k',
  shape: 'desktop',
  colors: ['blue'],
  colour: '#112233',
  animated: false,
  sources: ['aesthetic-wallpapers'],
};
const labels = { neon: 'Neon', city: 'City' };
const opts = { eager: false, base: '/', labels };

describe('cardHtml', () => {
  it('renders one list item with the link, data-slug and aspect ratio', () => {
    const html = cardHtml(card, opts);
    expect(html.startsWith('<li class="wall__item" data-slug="neon-city"')).toBe(true);
    expect(html.endsWith('</li>')).toBe(true);
    expect(html).toContain('style="--ar:1.7778;--c:#112233"');
    expect(html).toContain('href="/w/neon-city/"');
  });

  it('writes both srcset descriptors from the thumbnail width', () => {
    const html = cardHtml(card, opts);
    expect(html).toContain('srcset="/m/t/neon-city.webp 533w, /m/t/neon-city@2x.webp 1066w"');
    expect(html).toContain('width="533" height="300"');
  });

  it('puts the base path in front of links and images', () => {
    const html = cardHtml(card, { ...opts, base: '/walls/' });
    expect(html).toContain('href="/walls/w/neon-city/"');
    expect(html).toContain('src="/walls/m/t/neon-city.webp"');
  });

  it('builds the alt text from tag labels, falling back to the slug', () => {
    expect(cardHtml(card, opts)).toContain('alt="Neon City: Neon, City, unknown-tag"');
  });

  it('is lazy unless eager', () => {
    expect(cardHtml(card, opts)).toContain('loading="lazy"');
    expect(cardHtml(card, { ...opts, eager: true })).toContain('loading="eager"');
  });

  it('shows a 4K badge for 4k and a GIF badge that wins for animated ones', () => {
    expect(cardHtml(card, opts)).toContain('<span class="card__badge">4K</span>');
    const gif = cardHtml({ ...card, animated: true }, opts);
    expect(gif).toContain('<span class="card__badge">GIF</span>');
    expect(gif).not.toContain('4K');
    expect(cardHtml({ ...card, size: 'fhd' }, opts)).not.toContain('card__badge');
  });

  it('escapes the title in text and attributes', () => {
    const html = cardHtml({ ...card, title: '<script>"&\'' }, opts);
    expect(html).not.toContain('<script>');
    expect(html).toContain('<span class="card__title">&lt;script&gt;&quot;&amp;&#39;</span>');
    expect(html).toContain('alt="&lt;script&gt;&quot;&amp;&#39;: Neon, City, unknown-tag"');
  });
});

describe('toCardData', () => {
  it('keeps the first palette colour and leaves it empty without a palette', () => {
    const wallpaper = {
      slug: 'a', title: 'A', width: 10, height: 5, tags: ['x', 'y'], size: 'hd', shape: 'desktop',
      colors: ['red'], animated: false, palette: [{ hex: '#ff0000', share: 0.5 }], sourceId: 'nordic',
      alsoIn: [],
    } as unknown as Wallpaper;
    expect(toCardData(wallpaper).colour).toBe('#ff0000');
    expect(toCardData({ ...wallpaper, palette: [] }).colour).toBe('');
    expect(Object.keys(toCardData(wallpaper)).sort()).toEqual(
      ['animated', 'colors', 'colour', 'height', 'shape', 'size', 'slug', 'sources', 'tags', 'title', 'width'],
    );
  });

  it('names the collections that hold the wallpaper, so the browser can tell which collection pages it is on', () => {
    const wallpaper = { slug: 'a', palette: [], sourceId: 'nordic', alsoIn: ['gruvbox'] } as unknown as Wallpaper;
    expect(toCardData(wallpaper).sources).toEqual(['nordic', 'gruvbox']);
    const own = { slug: 'b', palette: [], sourceId: 'own', alsoIn: [] } as unknown as Wallpaper;
    expect(toCardData(own).sources).toEqual([SITE.defaultSource.id]);
  });
});
