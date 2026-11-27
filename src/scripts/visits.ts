// The visit counter that the maintainer's other sites share. It stores only a
// running total per site: no cookies, nothing that identifies a visitor.

export const VISITS_ENDPOINT = 'https://evelpidou.nkua.cloud/api/visits/awesome-wallpapers';
const COUNTED_KEY = 'awesome-wallpapers-visit-counted-v1';

interface Dependencies {
  fetch?: typeof fetch;
  storage?: Storage;
}

function alreadyCounted(storage: Storage | undefined): boolean {
  try {
    return storage?.getItem(COUNTED_KEY) === 'yes';
  } catch {
    return false;
  }
}

function markCounted(storage: Storage | undefined): void {
  try {
    storage?.setItem(COUNTED_KEY, 'yes');
  } catch {
    // The count still works when the browser keeps no storage.
  }
}

/**
 * Adds one visit for the first page of a browser session (POST) and only reads
 * the total on the pages after it (GET). Returns the total, or null when the
 * counter cannot be reached; the visit is then counted on the next page.
 */
export async function recordVisit(deps: Dependencies = {}): Promise<number | null> {
  const request = deps.fetch ?? fetch;
  const storage = deps.storage ?? (typeof sessionStorage === 'undefined' ? undefined : sessionStorage);
  const counted = alreadyCounted(storage);

  try {
    const response = await request(VISITS_ENDPOINT, {
      method: counted ? 'GET' : 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const total = Number(((await response.json()) as { count?: unknown }).count);
    if (!Number.isFinite(total) || total < 0) return null;
    if (!counted) markCounted(storage);
    return total;
  } catch {
    return null;
  }
}

/** Shows the total in the footer once the counter has answered; the line stays hidden otherwise. */
export async function initVisits(): Promise<void> {
  const line = document.querySelector<HTMLElement>('[data-visits]');
  const figure = line?.querySelector<HTMLElement>('[data-visits-count]');
  if (!line || !figure) return;
  const total = await recordVisit();
  if (total === null) return;
  figure.textContent = total.toLocaleString('en');
  line.hidden = false;
  dismissibleNote(line.querySelector<HTMLElement>('[data-info]'));
}

/** Escape closes the note without moving the pointer; it opens again on the next hover or focus. */
function dismissibleNote(info: HTMLElement | null): void {
  if (!info) return;
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') info.dataset.dismissed = '';
  });
  const reopen = () => delete info.dataset.dismissed;
  info.addEventListener('pointerleave', reopen);
  info.addEventListener('focusout', reopen);
}
