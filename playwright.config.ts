import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4322';

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
  ],
  webServer: {
    // 開発用.envや起動済みサーバーによらず、同じ静的成果物を検証する。
    // Astroのエージェント向け自動background化を避け、Playwrightが終了も管理する。
    command: 'npm run build && npm run preview -- --port 4322 --ignore-lock',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATA_SOURCE: 'sample',
      MICROCMS_SERVICE_DOMAIN: '',
      MICROCMS_API_KEY: '',
      SITE_URL: 'https://iamkaz.uno',
    },
  },
});
