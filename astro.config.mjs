import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Served by GitHub Pages on its own domain. The old address,
// alexandrosliaskos.github.io/Awesome_Wallpapers/, redirects here.
export default defineConfig({
  site: 'https://wallpapers.liaskos.eu',
  trailingSlash: 'always',
  integrations: [sitemap({ filter: (page) => !page.endsWith('/random/') })],
  // The stylesheet is small; inlining it saves every page a render-blocking request.
  build: { inlineStylesheets: 'always' },
});
