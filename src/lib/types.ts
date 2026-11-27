/** A tag from `data/tags.yml`, the controlled vocabulary. */
export type TagKind = 'palette' | 'subject';

export interface Tag {
  slug: string;
  label: string;
  kind: TagKind;
  /** One sentence shown on the tag page. */
  description: string;
  /** Hex colour shown next to palette tags. */
  swatch?: string;
}

export interface Attribution {
  name: string;
  url?: string;
}

/** One hand-written entry in `data/wallpapers.yml`. */
export interface Entry {
  file: string;
  title: string;
  tags: string[];
  featured?: boolean;
  /** Only needed when two filenames would produce the same slug. */
  slug?: string;
  /** The artist, when known. */
  credit?: Attribution;
  /** Where the file was collected from, when not the default source. */
  source?: Attribution;
}

export type SizeClass = '4k' | 'qhd' | 'fhd' | 'hd';
export type Shape = 'desktop' | 'ultrawide' | 'phone';
export type ColorBucket =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'dark'
  | 'light';

export interface Swatch {
  hex: string;
  /** Fraction of the image this colour covers, 0 to 1. */
  share: number;
}

export type ImageFormat = 'PNG' | 'JPG' | 'WEBP' | 'GIF';

/** An entry plus everything computed from its image file. */
export interface Wallpaper extends Entry {
  slug: string;
  width: number;
  height: number;
  bytes: number;
  format: ImageFormat;
  aspect: string;
  size: SizeClass;
  shape: Shape;
  palette: Swatch[];
  colors: ColorBucket[];
  animated: boolean;
  /** Where Download and "Open original" point: the original in its own repository. */
  download: string;
  /** The collection's id from `data/sources.yml`, or `own` for a file in `images/`. */
  sourceId: string;
  /** Ids of the other collections that hold the same image (see `mergeDuplicates`). */
  alsoIn: string[];
  /** Perceptual fingerprint, 16 hex digits (see `dHash`). */
  phash: string;
}

/**
 * A file of an indexed collection that was reviewed and approved, with what was
 * measured from it. Kept in `data/sources/` so a build need not download it again.
 */
export interface ApprovedFile {
  /** Path in the collection's repository. */
  path: string;
  /** Git blob SHA of the approved version. */
  sha: string;
  slug: string;
  title: string;
  tags: string[];
  width: number;
  height: number;
  bytes: number;
  animated: boolean;
  palette: Swatch[];
  phash: string;
  featured?: boolean;
  /**
   * Set by sync when tagging left fewer than two tags. Validation fails and the build leaves the
   * file out until someone tags it by hand and removes the mark.
   */
  held?: boolean;
}

/** What validation needs to know about a file on disk. */
export interface FileFacts {
  file: string;
  bytes: number;
  width: number;
  height: number;
  sha1: string;
}

export interface Issue {
  rule: string;
  file?: string;
  message: string;
}
