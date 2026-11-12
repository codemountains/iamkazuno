import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import minifyInlineScripts from './build/minify-inline-scripts.mjs';
import optimizeStaticAssets from './build/optimize-static-assets.mjs';

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
  integrations: [minifyInlineScripts(), optimizeStaticAssets()],
  // Cloudflareの_redirectsで転送するため、旧URLごとのHTMLは出力しない。
  build: { redirects: false },
  // 主要なサイト内リンクだけを先読みする。通常のページ遷移・履歴復元は維持する。
  prefetch: { prefetchAll: false, defaultStrategy: 'hover' },
  // Cloudflare normalizes public URLs; accept both forms during local development.
  trailingSlash: 'ignore',
  redirects: {
    '/things/[id]': { status: 301, destination: '/picks/things/[id]' },
  },
  devToolbar: { enabled: false },
});
