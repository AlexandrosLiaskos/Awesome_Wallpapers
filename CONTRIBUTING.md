# Contributing

Thank you for wanting to add to the collection. This page covers adding a wallpaper, which is what most contributions are, and then working on the site itself.

## Adding a wallpaper

### 1. Check that it fits

| | |
| --- | --- |
| **Size** | At least 1920 px on the long edge: 1920×1080 or larger for desktops, 1080×1920 or larger for phones. Bigger is better. |
| **File** | PNG, JPG, WebP or GIF, at most 25 MB. |
| **Name** | Lower-case letters, digits and hyphens, for example `night-city.png`. |
| **Content** | No watermarks, nothing explicit, and not already in the collection. |
| **Rights** | Only add work you made yourself or work whose artist allows it to be shared. If you know who made it, credit them (see below). |

Please do not upscale a small image to pass the size check. It will look worse than the original.

### 2. Add the file

Put it in the [`images/`](images) folder.

### 3. Describe it

Add an entry to [`data/wallpapers.yml`](data/wallpapers.yml). The file is in alphabetical order by filename.

```yaml
- file: night-city.png
  title: Night City
  tags: [city, night, neon]
```

That is everything that is required. Width, height, file size and colours are read from the image.

- **`title`** is what people see. Write a real name, not the filename.
- **`tags`** takes two to five slugs from [`data/tags.yml`](data/tags.yml). Use a palette tag such as `nord` or `gruvbox` only when the image really is in that colour scheme.

Three more fields are optional:

```yaml
  credit:                  # the artist
    name: Jane Doe
    url: https://example.com/jane
  source:                  # where you found it, if it matters
    name: Some collection
    url: https://example.com
  featured: true           # shown on the first screen; please leave this to the maintainer
```

### 4. Check your work

```sh
npm install
npm run validate
```

`validate` tells you what is wrong and with which file: a missing entry, an unknown tag, an image that is too small.

The same check runs on every pull request, with two more rules for the files it adds: the 1920 px minimum and the filename format. To apply those yourself, name your files:

```sh
npm run validate -- --new images/night-city.png
```

To see the wallpaper in the gallery before you open the pull request, run `npm run dev`.

### 5. Open a pull request

One pull request can add several wallpapers. Say where they come from.

## Suggesting a new tag

Tags are kept few on purpose, so that each one is worth browsing. If several wallpapers share something that no tag covers, propose the tag in your pull request by adding it to [`data/tags.yml`](data/tags.yml) with a label and a one-sentence description.

## Working on the site

The site is built with [Astro](https://astro.build) and needs Node.js 24 or newer.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the site at `localhost:4321/` |
| `npm run build` | Builds the site into `dist/` |
| `npm test` | Runs the tests |
| `npm run check` | Type-checks the project |
| `npm run validate` | Checks `data/` against the files in `images/` |

Where things are:

| Path | Contents |
| --- | --- |
| `src/lib/` | Logic with no browser or file access: validation, classification, colours, layout and filtering, each with tests. |
| `src/components/`, `src/pages/`, `src/styles/` | The pages and how they look. |
| `src/scripts/` | What runs in the browser: wall layout, filters, the viewer, downloads. |
| `scripts/` | What runs at build time: image processing and validation. |
| `tests/` | Tests, mirroring the folders above. |

A few principles the code follows:

- Every page works without JavaScript. Scripts add to a page; they never hold it up.
- Nothing tracks visitors. The only requests to other sites are the original files on GitHub and the visit counter, which stores only a total.
- Original images are never modified. Everything derived from them is generated.
- New logic comes with a test.

## Reporting a problem

[Open an issue](https://github.com/AlexandrosLiaskos/Awesome_Wallpapers/issues/new/choose). For a wallpaper that should be credited or removed, there is a form for exactly that.
