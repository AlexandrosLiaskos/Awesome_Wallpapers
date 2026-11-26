// The viewer shows a wallpaper over the gallery. It has no markup of its own:
// it fetches the wallpaper's page and shows that page's `#wp` element, so the
// viewer and the page can never drift apart. The address changes with it, and
// the back button closes it.

const dialog = document.querySelector<HTMLDialogElement>('#viewer');
const pages = new Map<string, Promise<HTMLElement>>();

let order: string[] = [];
let current = '';
let opener: HTMLElement | null = null;
let titleBefore = '';

function pageOf(slug: string): string {
  return `${dialog?.dataset.base ?? '/'}w/${slug}/`;
}

function load(slug: string): Promise<HTMLElement> {
  let page = pages.get(slug);
  if (!page) {
    page = fetch(pageOf(slug))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((html) => {
        const view = new DOMParser().parseFromString(html, 'text/html').querySelector<HTMLElement>('#wp');
        if (!view) throw new Error('The page has no wallpaper in it');
        return view;
      });
    // A failed request is forgotten, so the next try starts fresh.
    page.catch(() => pages.delete(slug));
    pages.set(slug, page);
  }
  return page;
}

/** Fetches a wallpaper's page ahead of time, e.g. while the pointer is over its card. */
export function prefetch(slug: string): void {
  if (dialog && slug) load(slug).catch(() => {});
}

function neighbour(step: number): string | undefined {
  const index = order.indexOf(current);
  if (index === -1 || order.length < 2) return undefined;
  return order[(index + step + order.length) % order.length];
}

function show(view: HTMLElement, slug: string): void {
  current = slug;
  dialog!.replaceChildren(document.importNode(view, true));
  dialog!.scrollTop = 0;
  document.title = `${view.dataset.title ?? ''} · Awesome Wallpapers`;
  dialog!.querySelector<HTMLElement>('[data-close]')?.focus({ preventScroll: true });
  for (const step of [1, -1]) {
    const next = neighbour(step);
    if (next) prefetch(next);
  }
}

function hide(): void {
  if (!dialog?.open) return;
  dialog.close();
  dialog.replaceChildren();
  document.title = titleBefore;
  opener?.focus({ preventScroll: true });
  opener = null;
}

/** Closing goes through history, so the address returns to the gallery's. */
function close(): void {
  if (history.state?.viewer) history.back();
  else hide();
}

/**
 * Shows a wallpaper in the viewer. `slugs` is the list the arrows walk
 * through: the wallpapers currently on the wall, in their order.
 */
export async function openViewer(slug: string, slugs: string[]): Promise<void> {
  if (!dialog) {
    location.assign(pageOf(slug));
    return;
  }

  let view: HTMLElement;
  try {
    view = await load(slug);
  } catch {
    location.assign(pageOf(slug)); // The page itself still works.
    return;
  }

  order = slugs;
  if (dialog.open) {
    history.replaceState({ viewer: slug }, '', pageOf(slug));
  } else {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    titleBefore = document.title;
    dialog.showModal();
    history.pushState({ viewer: slug }, '', pageOf(slug));
  }
  show(view, slug);
}

function step(direction: number): void {
  const next = neighbour(direction);
  if (next) void openViewer(next, order);
}

export function initViewer(): void {
  if (!dialog) return;

  dialog.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const plain = !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);

    if (target.closest('[data-close]') && plain) {
      event.preventDefault();
      close();
      return;
    }
    const arrow = target.closest<HTMLElement>('[data-step]');
    if (arrow && plain && order.length > 1) {
      event.preventDefault();
      step(Number(arrow.dataset.step));
    }
  });

  // Escape closes through history too, instead of leaving a stale address behind.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });

  addEventListener('popstate', () => {
    const slug = history.state?.viewer as string | undefined;
    if (!slug) {
      hide();
    } else if (slug !== current || !dialog.open) {
      load(slug)
        .then((view) => {
          if (!dialog.open) dialog.showModal();
          show(view, slug);
        })
        .catch(() => location.reload());
    }
  });

  addEventListener('keydown', (event) => {
    if (!dialog.open || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest('input, textarea')) return;
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  });

  // A sideways swipe on the image moves to the next or previous wallpaper.
  let start: { x: number; y: number } | null = null;
  dialog.addEventListener('pointerdown', (event) => {
    const onStage = (event.target as HTMLElement).closest('.view__stage');
    start = onStage && event.pointerType !== 'mouse' ? { x: event.clientX, y: event.clientY } : null;
  });
  dialog.addEventListener('pointerup', (event) => {
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  });
}
