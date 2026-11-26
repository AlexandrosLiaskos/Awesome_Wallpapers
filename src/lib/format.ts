import type { Shape, SizeClass } from './types.ts';

export const SIZE_LABEL: Record<SizeClass, string> = { '4k': '4K+', qhd: 'QHD', fhd: 'FHD', hd: 'HD' };
export const SHAPE_LABEL: Record<Shape, string> = { desktop: 'Desktop', ultrawide: 'Ultrawide', phone: 'Phone' };

/** A file size the way a person would say it: "70 KB", "1.88 MB", "15.1 MB". */
export function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${megabytes.toFixed(megabytes < 10 ? 2 : 1)} MB`;
}

/** "No. 014 / 346" for the wallpaper at a zero-based position. */
export function numberInCollection(index: number, total: number): string {
  return `No. ${String(index + 1).padStart(String(total).length, '0')} / ${total}`;
}
