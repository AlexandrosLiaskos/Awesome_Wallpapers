import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Served by GitHub Pages as a project site, so every URL lives under `base`.
export default defineConfig({
  site: 'https://alexandrosliaskos.github.io',
  base: '/Awesome_Wallpapers',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
