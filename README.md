<p align="center">
  <a href="https://wallpapers.liaskos.eu/">
    <img src=".github/readme-hero.jpg" alt="Eight wallpapers from the collection, among them a neon roadside at dusk, a cottage in an enchanted forest, a deer by a lake at sunset and a shrine under a cherry tree." width="100%">
  </a>
</p>

<h1 align="center">Awesome Wallpapers</h1>

<p align="center">
  A fast, searchable gallery of aesthetic wallpapers.<br>
  Free to download. No ads, no tracking.
</p>

<p align="center">
  <a href="https://wallpapers.liaskos.eu/"><b>Browse the gallery →</b></a>
</p>

<p align="center">
  <a href="https://github.com/AlexandrosLiaskos/Awesome_Wallpapers/stargazers"><img alt="GitHub stars" src="https://img.shields.io/github/stars/AlexandrosLiaskos/Awesome_Wallpapers?style=flat-square&labelColor=0a0d0c&color=5eead4"></a>
  <a href="https://wallpapers.liaskos.eu/"><img alt="Number of wallpapers" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fwallpapers.liaskos.eu%2Fapi%2Fwallpapers.json&query=%24.length&label=wallpapers&style=flat-square&labelColor=0a0d0c&color=5eead4"></a>
  <a href="https://github.com/AlexandrosLiaskos/Awesome_Wallpapers/actions/workflows/deploy.yml"><img alt="Deploy status" src="https://img.shields.io/github/actions/workflow/status/AlexandrosLiaskos/Awesome_Wallpapers/deploy.yml?label=deploy&style=flat-square&labelColor=0a0d0c"></a>
  <a href="LICENSE"><img alt="Code licence: MIT" src="https://img.shields.io/badge/code-MIT-5eead4?style=flat-square&labelColor=0a0d0c"></a>
</p>

## What this is

A gallery for people who care how their desktop looks: Nord, Gruvbox and Catppuccin setups, anime backdrops, pixel art, minimal logos, landscapes worth a second monitor.

The gallery is this repository's work. The wallpapers are not: they belong to the artists who made them. The ones in `images/` were collected by [D3Ext](https://github.com/D3Ext) in [aesthetic-wallpapers](https://github.com/D3Ext/aesthetic-wallpapers). The gallery also indexes [Nordic Wallpapers](https://github.com/linuxdotexe/nordic-wallpapers), [Rosé Pine Wallpapers](https://github.com/rose-pine/wallpapers) and [Gruvbox Wallpapers](https://github.com/AngelJumbo/gruvbox-wallpapers). Their originals are not copied here; each one is downloaded from its collection's repository. [NOTICE.md](NOTICE.md) has the details, including how to have a wallpaper credited or removed.

## Features

- **Search and filters.** Search by name or tag, then narrow by size (FHD to 4K+), shape (desktop, ultrawide, phone) and dominant colour. A filtered view has its own address, so it can be shared.
- **A page for every wallpaper**, with its resolution, aspect ratio, format, file size and a five-colour palette. Click a colour to copy its hex code.
- **A page for every tag**, from [Nord](https://wallpapers.liaskos.eu/tags/nord/) to [pixel art](https://wallpapers.liaskos.eu/tags/pixel-art/).
- **A page for every collection**, with a link to its repository.
- **Keyboard friendly.** `/` to search, `←` `→` to move between wallpapers, `Esc` to close.
- **Light.** The gallery shows small thumbnails. An original is fetched only when you download it, or when you open one of the few animated wallpapers.
- **Private.** No analytics and no cookies. Two requests go elsewhere: an original file, from GitHub, when you ask for it, and a count of page visits on the maintainer's server, which stores only the total.
- **Works without JavaScript.** Browsing, tag pages and downloads are plain links. Scripts add search, filters and the viewer.

## Collections

The wallpapers come from these collections on GitHub. A collection gets its page in the gallery, under [Collections](https://wallpapers.liaskos.eu/sources/), once its first files are approved.

| Collection | Maintainer | In this repository |
| --- | --- | --- |
| [Aesthetic Wallpapers](https://github.com/D3Ext/aesthetic-wallpapers) | D3Ext | the files, in `images/` |
| [Nordic Wallpapers](https://github.com/linuxdotexe/nordic-wallpapers) | linuxdotexe | an index |
| [Rosé Pine Wallpapers](https://github.com/rose-pine/wallpapers) | rose-pine | an index |
| [Gruvbox Wallpapers](https://github.com/AngelJumbo/gruvbox-wallpapers) | AngelJumbo | an index |

For an indexed collection this repository keeps a title, tags and measurements for each file, in `data/sources/`. The gallery shows small previews, and Download fetches the original from the collection's repository. The list is kept in [`data/sources.yml`](data/sources.yml). A maintainer who would rather not be listed can [open an issue](https://github.com/AlexandrosLiaskos/Awesome_Wallpapers/issues/new/choose), and the collection is removed.

## Get the wallpapers

**From the gallery.** Open a wallpaper and press Download.

**The ones in this repository, with git.** A sparse clone fetches only the `images` folder:

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/AlexandrosLiaskos/Awesome_Wallpapers.git
cd Awesome_Wallpapers
git sparse-checkout set images
```

**From a script.** The whole catalog is one JSON file, with the title, tags, size, palette and addresses of every wallpaper:

```sh
curl -s https://wallpapers.liaskos.eu/api/wallpapers.json
```

For example, to download one at random (needs `jq`):

```sh
url=$(curl -s https://wallpapers.liaskos.eu/api/wallpapers.json | jq -r '.[].raw' | shuf -n 1)
curl -sLO "$url"
```

## Contributing

New wallpapers are welcome. In short:

1. Add the image to `images/`.
2. Add an entry for it to [`data/wallpapers.yml`](data/wallpapers.yml): a title and two to five tags.
3. Run `npm run validate` and open a pull request.

[CONTRIBUTING.md](CONTRIBUTING.md) has the rules for a wallpaper (size, format, naming) and the list of tags.

## Running the site locally

You need [Node.js](https://nodejs.org/) 24 or newer.

```sh
npm install
npm run dev
```

The first run builds a thumbnail and a preview for every wallpaper, which takes about a minute. Later runs only process what changed.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the site at `localhost:4321/` |
| `npm run build` | Builds the site into `dist/` |
| `npm run validate` | Checks `data/` against the files in `images/` |
| `npm test` | Runs the tests |
| `npm run check` | Type-checks the project |

## How it works

```
images/              the original files
data/wallpapers.yml  a title and tags for each file, written by hand
data/tags.yml        the tags that may be used
data/sources.yml     the collections on GitHub that are indexed
data/sources/        the files of each collection that were reviewed and approved,
                     and the ones skipped, with the reason
        │
        ▼
scripts/build-media.ts   measures every image, extracts its colours,
                         and makes thumbnails, previews and share images
        │
        ▼
src/                 an Astro site, rendered to static pages
        │
        ▼
GitHub Pages         built and deployed by GitHub Actions on every push to main
```

Width, height, file size and colours are read from the files themselves, so the data files hold only what a person has to decide.

## Credit and removal requests

If you made one of these wallpapers and would like to be credited, or would like it taken down, [open an issue](https://github.com/AlexandrosLiaskos/Awesome_Wallpapers/issues/new/choose). That is all it takes.

## Licence

The code is released under the [MIT licence](LICENSE). The wallpapers are not covered by it; see [NOTICE.md](NOTICE.md).
