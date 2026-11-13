import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_PORT ?? '4322';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  workers: 2,
  retries: 0,
  timeout: 30_000,
  globalTimeout: 5 * 60_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    // Safari系の画像デコード・先読みの中断・CSPの適用も継続検証する。
    { name: 'mobile-webkit', testMatch: ['images.spec.ts', 'prefetch.spec.ts', 'security.spec.ts'], use: { ...devices['iPhone 16'] } },
  ],
  webServer: {
    // 開発用.envや起動済みサーバーによらず、同じ静的成果物を検証する。
    // _headersを含めて本番と同じ静的配信を検証する。
    command: `npm run build && wrangler dev --local --ip 127.0.0.1 --port ${port} --inspector-port 0 --no-show-interactive-dev-session`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATA_SOURCE: 'sample',
      MICROCMS_SERVICE_DOMAIN: '',
      MICROCMS_API_KEY: '',
      SITE_URL: 'https://iamkaz.uno',
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
      WRANGLER_SEND_METRICS: 'false',
      WRANGLER_LOG_PATH: '.wrangler/logs',
    },
  },
});
