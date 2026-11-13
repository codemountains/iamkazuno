import { test, expect, expectCollectionReady } from './fixtures';

test('document navigation aborts collection prefetch before the next page responds', async ({ page }) => {
  const started: string[] = [];
  const aborted: string[] = [];
  await page.exposeFunction('recordPrefetch', (event: string, url: string) => {
    (event === 'started' ? started : aborted).push(url);
  });
  await page.addInitScript(() => {
    const record = (window as unknown as {
      recordPrefetch: (event: string, url: string) => Promise<void>;
    }).recordPrefetch;
    const originalFetch = window.fetch;
    window.fetch = (input, options) => {
      const url = String(input);
      if (!new URL(url, location.href).pathname.startsWith('/picks/things/')) return originalFetch(input, options);
      // 転送中の先読みを再現し、ブラウザの遷移開始時に中断されるかを確認する。
      void record('started', url);
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => {
          void record('aborted', url);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      });
    };
  });

  await page.goto('/picks');
  await expectCollectionReady(page);
  await expect.poll(() => started.length).toBe(2);

  let release!: () => void;
  const responseReady = new Promise<void>((resolve) => { release = resolve; });
  let navigationStarted = false;
  await page.route('**/picks/things/mountain-boots', async (route) => {
    navigationStarted = true;
    await responseReady;
    await route.continue();
  });
  const navigation = page.locator('a[href="/picks/things/mountain-boots"]').click();
  try {
    await expect.poll(() => navigationStarted).toBe(true);
    // pagehideを待つ実装では、遷移先の応答が届くまで中断できない。
    await expect.poll(() => aborted.length).toBe(2);
    expect(aborted.toSorted()).toEqual(started.toSorted());
  } finally {
    release();
    await navigation;
  }
  await expect(page).toHaveURL('/picks/things/mountain-boots');
});
