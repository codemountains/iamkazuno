import { test as base } from '@playwright/test';
import { test, expect, expectCollectionReady } from './fixtures';

// 各ページを独立して開き、WebKitで文書置換と先読みが競合するのを避ける。
for (const path of ['/', '/picks', '/picks/things/mountain-boots', '/missing-security-test-page']) {
  test(`CSP is enforced on ${path}`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(path.startsWith('/missing-') ? 404 : 200);
    const headers = response!.headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    const policy = headers['content-security-policy'];
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("'sha256-");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(headers['content-security-policy-report-only']).toBeUndefined();
    await expect(page.locator('main')).toBeVisible();
    if (path === '/picks') await expectCollectionReady(page);
  });
}

// 意図的な違反を起こすため、通常操作用の「CSP違反なし」fixtureを使用しない。
base('CSP blocks unapproved inline scripts, modules, event handlers, and external scripts', async ({ page }) => {
  const violations: Array<{ directive: string; blockedURI: string }> = [];
  let externalRequests = 0;
  await page.route('https://csp-probe.invalid/probe.js', async (route) => {
    externalRequests += 1;
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'document.documentElement.dataset.externalCspProbe = "executed";',
    });
  });
  await page.exposeFunction('recordProbeViolation', (violation: { directive: string; blockedURI: string }) => {
    violations.push(violation);
  });
  await page.goto('/picks');
  await expectCollectionReady(page);

  await page.evaluate(() => {
    const report = (window as unknown as {
      recordProbeViolation: (violation: { directive: string; blockedURI: string }) => Promise<void>;
    }).recordProbeViolation;
    document.addEventListener('securitypolicyviolation', (event) => {
      void report({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
    });

    const script = document.createElement('script');
    script.textContent = 'document.documentElement.dataset.inlineCspProbe = "executed";';
    document.body.append(script);

    const module = document.createElement('script');
    module.type = 'module';
    module.textContent = 'document.documentElement.dataset.moduleCspProbe = "executed";';
    document.body.append(module);

    const button = document.createElement('button');
    button.setAttribute('onclick', 'document.documentElement.dataset.eventCspProbe = "executed";');
    document.body.append(button);
    button.click();

    const external = document.createElement('script');
    external.src = 'https://csp-probe.invalid/probe.js';
    document.body.append(external);
  });

  await expect.poll(() => violations.filter((violation) =>
    violation.directive === 'script-src-elem' && violation.blockedURI === 'inline',
  ).length).toBe(2);
  await expect.poll(() => violations.some((violation) =>
    violation.directive === 'script-src-attr' && violation.blockedURI === 'inline',
  )).toBe(true);
  await expect.poll(() => violations.some((violation) =>
    violation.directive === 'script-src-elem' && violation.blockedURI.startsWith('https://csp-probe.invalid'),
  )).toBe(true);
  expect(await page.locator('html').evaluate((element) =>
    Object.keys((element as HTMLElement).dataset).filter((key) => key.endsWith('CspProbe')),
  )).toEqual([]);
  expect(externalRequests, '禁止した外部スクリプトを取得しない').toBe(0);
});
