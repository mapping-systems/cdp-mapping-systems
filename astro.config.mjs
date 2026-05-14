// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://mapping-systems.pages.dev',
  integrations: [mdx()],

  vite: {
    plugins: [/** @type {any} */ (tailwindcss())],
  },

  markdown: {
    shikiConfig: {
      // Dual themes: Shiki emits CSS vars for both, swap via prefers-color-scheme or .dark class
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
      wrap: true,
    },
  },

  adapter: cloudflare(),
});