// Everything the browser runs. Every page works without it; this adds the
// exact wall layout, search and filters, the viewer and the wallpaper buttons.

import { initActions } from './actions.ts';
import { initGallery, visibleSlugs } from './gallery.ts';
import { initWalls } from './layout.ts';
import { initViewer, openViewer, prefetch } from './viewer.ts';
import { initVisits } from './visits.ts';

/** The slugs of the wall a card sits on, in the order shown. */
function slugsAround(card: Element): string[] {
  const wall = card.closest('[data-wall]');
  if (!wall) return [];
  if (wall.hasAttribute('data-filterable')) return visibleSlugs();
  return [...wall.children].map((item) => (item as HTMLElement).dataset.slug ?? '');
}

function slugOf(card: Element): string {
  return card.closest<HTMLElement>('[data-slug]')?.dataset.slug ?? '';
}

initWalls();
initViewer();
initActions();
void initVisits();
initGallery((slug) => void openViewer(slug, visibleSlugs()));

// A plain click on a card opens the viewer; a modified click still opens the page in a tab.
document.addEventListener('click', (event) => {
  const card = (event.target as HTMLElement).closest('.wall .card');
  if (!card || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  void openViewer(slugOf(card), slugsAround(card));
});

// Fetch a wallpaper's page as soon as someone shows interest in its card.
for (const type of ['pointerover', 'focusin', 'touchstart'] as const) {
  document.addEventListener(
    type,
    (event) => {
      const card = (event.target as HTMLElement).closest?.('.wall .card');
      if (card) prefetch(slugOf(card));
    },
    { passive: true },
  );
}

addEventListener('keydown', (event) => {
  const typing = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]');
  if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

  // "/" focuses the search field from anywhere on the site.
  const field = document.querySelector<HTMLInputElement>('[data-search]');
  if (event.key === '/' && field && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    field.focus();
    return;
  }

  // On a wallpaper's own page the arrow keys follow its previous and next links.
  if (!document.querySelector('dialog[open]')) {
    const rel = event.key === 'ArrowLeft' ? 'prev' : event.key === 'ArrowRight' ? 'next' : '';
    if (rel) document.querySelector<HTMLAnchorElement>(`main > #wp a[rel="${rel}"]`)?.click();
  }
});
