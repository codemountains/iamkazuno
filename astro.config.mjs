import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');
const site = process.env.SITE_URL || env.SITE_URL || 'https://iamkaz.uno';

if (site) {
  const parsed = new URL(site);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('SITE_URL must be an absolute HTTP or HTTPS URL.');
  }
}

export default defineConfig({
  output: 'static',
  site,
  // Cloudflare normalizes public URLs; accept both forms during local development.
  trailingSlash: 'ignore',
  redirects: {
    '/things/[id]': { status: 301, destination: '/picks/things/[id]' },
  },
  devToolbar: { enabled: false },
});
