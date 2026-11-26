// The buttons on a wallpaper: download, copy link, copy a colour. They work
// the same on the wallpaper's own page and inside the viewer, so the handlers
// listen on the document.

import { saveAs } from './download.ts';

async function copy(button: HTMLElement): Promise<void> {
  const text = button.dataset.copy ?? '';
  const label = button.querySelector<HTMLElement>('[data-copy-text]') ?? button;
  const before = label.textContent;
  try {
    await navigator.clipboard.writeText(text);
    label.textContent = 'Copied';
  } catch {
    label.textContent = 'Copy failed';
  }
  setTimeout(() => {
    label.textContent = before;
  }, 1200);
}

async function download(link: HTMLAnchorElement): Promise<void> {
  if (link.getAttribute('aria-busy') === 'true') return;
  const label = link.querySelector<HTMLElement>('[data-download-text]') ?? link;
  const before = label.textContent;

  link.setAttribute('aria-busy', 'true');
  label.textContent = 'Downloading…';
  const outcome = await saveAs(link.href, link.dataset.download ?? '');
  link.removeAttribute('aria-busy');
  label.textContent = outcome === 'saved' ? 'Saved' : before;
  setTimeout(() => {
    label.textContent = before;
  }, 1600);
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
