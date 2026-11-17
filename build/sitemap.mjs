import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';
import { Parser } from 'htmlparser2';

/** @param {string} value */
function withoutTrailingSlash(value) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
}

/** @returns {import('astro').AstroIntegration} */
export default function indexableSitemap() {
  const indexableUrls = new Set();
  const integration = sitemap({
    filter: (page) => indexableUrls.has(withoutTrailingSlash(page)),
    serialize: (item) => ({ ...item, url: withoutTrailingSlash(item.url) }),
  });
  const buildSitemap = integration.hooks['astro:build:done'];

  return {
    ...integration,
    hooks: {
      ...integration.hooks,
      'astro:build:done': async (options) => {
        indexableUrls.clear();
        const directory = fileURLToPath(options.dir);
        const paths = (await readdir(directory, { recursive: true })).filter((path) => path.endsWith('.html'));
        const pages = await Promise.all(paths.map((path) => readFile(join(directory, path), 'utf8')));

        // Use the rendered metadata so sample content and future noindex pages stay excluded.
        for (const html of pages) {
          let canonical;
          let noindex = false;
          let inHead = false;
          const parser = new Parser({
            onopentag(name, attributes) {
              if (name === 'head') inHead = true;
              if (!inHead) return;
              if (name === 'link' && attributes.rel?.toLowerCase().split(/\s+/).includes('canonical')) {
                canonical = attributes.href;
              }
              if (name === 'meta' && ['robots', 'googlebot'].includes(attributes.name?.toLowerCase())) {
                noindex ||= (attributes.content ?? '').toLowerCase().split(/[\s,]+/)
                  .some((directive) => directive === 'noindex' || directive === 'none');
              }
            },
            onclosetag(name) {
              if (name === 'head') inHead = false;
            },
          });
          parser.end(html);
          if (canonical && !noindex) indexableUrls.add(canonical);
        }

        await buildSitemap(options);
      },
    },
  };
}
