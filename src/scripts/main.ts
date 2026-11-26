// Everything the browser runs. Pages work without it; this adds the exact
// wall layout, search and filters.

import { cardOf, initGallery } from './gallery.ts';
import { initWalls } from './layout.ts';

initWalls();
initGallery((slug) => cardOf(slug)?.click());

// "/" focuses the search field from anywhere on the site.
addEventListener('keydown', (event) => {
  const field = document.querySelector<HTMLInputElement>('[data-search]');
  const typing = (event.target as HTMLElement).closest('input, textarea, select, [contenteditable]');
  if (event.key !== '/' || !field || typing || event.ctrlKey || event.metaKey || event.altKey) return;
  event.preventDefault();
  field.focus();
});
