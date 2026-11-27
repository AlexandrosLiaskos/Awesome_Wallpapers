// The filter bar never runs off the side of the screen. Tag chips wrap; until someone
// asks for more, the bar keeps one row of them on wide screens and two on small ones,
// ending in a chip that says how many are left. On small screens the size, shape,
// colour and sort controls open from a Filters button instead of a sideways row.

export const WIDE = '(min-width: 861px)';
export const ROWS_WIDE = 1;
export const ROWS_NARROW = 2;

/** Lays the tag row out: everything when open, otherwise as many rows as the screen allows. */
export function layoutTags(row: HTMLElement, toggle: HTMLButtonElement, open: boolean, wide: boolean): void {
  const items = [...row.children].filter((child): child is HTMLElement => child !== toggle);
  for (const item of items) item.hidden = false;
  row.dataset.state = open ? 'open' : 'closed';

  if (open) {
    toggle.hidden = false;
    toggle.textContent = 'Show fewer';
    toggle.removeAttribute('aria-label');
    toggle.setAttribute('aria-expanded', 'true');
    return;
  }

  toggle.hidden = true;
  const tops = [...new Set(items.map((item) => item.offsetTop))].sort((a, b) => a - b);
  const rows = wide ? ROWS_WIDE : ROWS_NARROW;
  if (tops.length <= rows) return;

  const lastTop = tops[rows - 1];
  for (const item of items) if (item.offsetTop > lastTop) item.hidden = true;
  toggle.hidden = false;

  // Make room for the toggle on the last row, and never end that row on the divider.
  const shown = items.filter((item) => !item.hidden);
  while (shown.length > 1 && (toggle.offsetTop > lastTop || shown.at(-1)!.classList.contains('filters__divider'))) {
    shown.pop()!.hidden = true;
  }

  const left = items.filter((item) => item.hidden && item.hasAttribute('data-tag')).length;
  if (left === 0) {
    for (const item of items) item.hidden = false;
    toggle.hidden = true;
    return;
  }
  toggle.textContent = `+${left} more`;
  toggle.setAttribute('aria-label', `Show ${left} more tags`);
  toggle.setAttribute('aria-expanded', 'false');
}

export function initFilterBar(): void {
  const row = document.querySelector<HTMLElement>('[data-tag-row]');
  const toggle = row?.querySelector<HTMLButtonElement>('[data-tag-more]');
  if (row && toggle) {
    let open = false;
    const layout = () => {
      layoutTags(row, toggle, open, matchMedia(WIDE).matches);
      // A tag chosen from the address bar must stay in sight.
      if (!open && row.querySelector('[aria-current][hidden]')) {
        open = true;
        layout();
      }
    };
    toggle.addEventListener('click', () => {
      open = !open;
      layout();
      toggle.focus();
    });
    let frame = 0;
    addEventListener('resize', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    });
    void document.fonts?.ready.then(layout);
    layout();
  }

  const facets = document.querySelector<HTMLElement>('[data-facets]');
  const facetsToggle = facets?.querySelector<HTMLButtonElement>('[data-facets-toggle]');
  facetsToggle?.addEventListener('click', () => {
    const open = !facets!.hasAttribute('data-open');
    facets!.toggleAttribute('data-open', open);
    facetsToggle.setAttribute('aria-expanded', String(open));
  });
}
