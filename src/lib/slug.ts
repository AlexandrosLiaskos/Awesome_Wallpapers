const RAW_BASE = 'https://raw.githubusercontent.com/AlexandrosLiaskos/Awesome_Wallpapers/main/images/';

/** URL-safe identifier for a wallpaper, derived from its filename. */
export function toSlug(file: string): string {
  return slugify(file.replace(/\.[^.]+$/, ''));
}

/** Lower-case letters and digits joined by single hyphens; accents are dropped, not the letter. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Address of the original file on GitHub. Filenames are kept as they are, so they need encoding. */
export function rawUrl(file: string): string {
  return RAW_BASE + encodeURIComponent(file);
}
