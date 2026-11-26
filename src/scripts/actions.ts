// The buttons on a wallpaper: download, copy link, copy a colour. They work
// the same on the wallpaper's own page and inside the viewer, so the handlers
// listen on the document.

import { saveAs } from './download.ts';

const resets = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/** The label's own text, remembered the first time it is replaced. */
function original(label: HTMLElement): string {
  label.dataset.label ??= label.textContent ?? '';
  return label.dataset.label;
}

/**
 * Shows a message in place of a label, then puts the label back. A second
 * click while the message is showing restarts the wait rather than mistaking
 * the message for the label.
 */
function flash(label: HTMLElement, message: string, duration: number): void {
  const text = original(label);
  label.textContent = message;
  clearTimeout(resets.get(label));
  resets.set(
    label,
    setTimeout(() => {
      label.textContent = text;
    }, duration),
  );
}

async function copy(button: HTMLElement): Promise<void> {
  const label = button.querySelector<HTMLElement>('[data-copy-text]') ?? button;
  original(label);
  try {
    await navigator.clipboard.writeText(button.dataset.copy ?? '');
    flash(label, 'Copied', 1200);
  } catch {
    flash(label, 'Copy failed', 1200);
  }
}

async function download(link: HTMLAnchorElement): Promise<void> {
  if (link.getAttribute('aria-busy') === 'true') return;
  const label = link.querySelector<HTMLElement>('[data-download-text]') ?? link;
  const text = original(label);

  link.setAttribute('aria-busy', 'true');
  clearTimeout(resets.get(label));
  label.textContent = 'Downloading…';
  const outcome = await saveAs(link.href, link.dataset.download ?? '');
  link.removeAttribute('aria-busy');
  if (outcome === 'saved') flash(label, 'Saved', 1600);
  else label.textContent = text;
}

export function initActions(): void {
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    const copier = target.closest<HTMLElement>('[data-copy]');
    if (copier) {
      void copy(copier);
      return;
    }

    const downloader = target.closest<HTMLAnchorElement>('a[data-download]');
    if (downloader && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
      event.preventDefault();
      void download(downloader);
    }
  });
}
