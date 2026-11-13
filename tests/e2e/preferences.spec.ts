import type { Locator } from '@playwright/test';
import { test, expect, expectCollectionReady } from './fixtures';

async function columnCount(grid: Locator) {
  return grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
}

for (const initialTheme of ['light', 'dark'] as const) {
  test(`theme follows the ${initialTheme} system preference until manually selected`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: initialTheme });
    await page.goto('/picks');
    await expectCollectionReady(page);

    const root = page.locator('html');
    const toggle = page.getByRole('switch', { name: 'ダークモード' });
    await expect(root).toHaveAttribute('data-theme', initialTheme);
    await expect(toggle).toHaveAttribute('aria-checked', String(initialTheme === 'dark'));

    const nextTheme = initialTheme === 'light' ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: nextTheme });
    await expect(root).toHaveAttribute('data-theme', nextTheme);
    await expect(toggle).toHaveAttribute('aria-checked', String(nextTheme === 'dark'));
  });
}

test('manual theme choice survives navigation and reload, independently of OS changes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/picks');
  await expectCollectionReady(page);

  const toggle = page.getByRole('switch', { name: 'ダークモード' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('link', { name: 'ブーツ', exact: true }).click();
  await expect(page).toHaveURL(/\/picks\/things\/mountain-boots\/?$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('link', { name: 'Back to picks', exact: true }).click();
  await expectCollectionReady(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('image size controls the actual grid and persists through detail navigation and reload', async ({ page, isMobile }) => {
  await page.goto('/picks');
  await expectCollectionReady(page);

  const slider = page.getByRole('slider', { name: '画像サイズ' });
  const grid = page.locator('[data-item-grid]');
  const firstCard = grid.locator('[data-item]').first();
  await expect(slider).toHaveValue('240');
  if (isMobile) await expect.poll(() => columnCount(grid)).toBe(2);
  const initialWidth = await firstCard.evaluate((element) => element.getBoundingClientRect().width);
  const initialColumns = await columnCount(grid);

  // Exercise the native range control's input/change events with keyboard and touch.
  await slider.press('Home');
  await expect(slider).toHaveValue('88');
  await expect.poll(() => firstCard.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(initialWidth);
  if (isMobile) await expect.poll(() => columnCount(grid)).toBe(6);
  else await expect.poll(() => columnCount(grid)).toBeGreaterThan(initialColumns);
  const smallWidth = await firstCard.evaluate((element) => element.getBoundingClientRect().width);
  const smallColumns = await columnCount(grid);

  if (isMobile) {
    const bounds = await slider.boundingBox();
    if (!bounds) throw new Error('The image size slider must be visible before tapping it.');
    const right = { x: bounds.width - 1, y: bounds.height / 2 };
    const middle = { x: bounds.width / 2, y: bounds.height / 2 };

    await slider.tap({ position: right });
    await expect(slider).toHaveValue('280');
    await expect.poll(() => columnCount(grid)).toBe(1);
    await slider.tap({ position: middle });
    await expect(slider).toHaveValue('184');
    await expect.poll(() => columnCount(grid)).toBe(3);
    await slider.tap({ position: right });
  } else {
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('96');
    await slider.press('Home');
    for (let step = 0; step < 12; step += 1) await slider.press('ArrowRight');
    await expect(slider).toHaveValue('184');
    await slider.press('End');
  }

  await expect(slider).toHaveValue('280');
  await expect.poll(() => firstCard.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(smallWidth);
  if (isMobile) await expect.poll(() => columnCount(grid)).toBe(1);
  else await expect.poll(() => columnCount(grid)).toBeLessThan(smallColumns);
  const largeColumns = await columnCount(grid);

  await page.getByRole('link', { name: 'ブーツ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ブーツ', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to picks', exact: true }).click();
  await expectCollectionReady(page);
  await expect(slider).toHaveValue('280');
  await expect.poll(() => columnCount(grid)).toBe(largeColumns);
  await page.reload();
  await expectCollectionReady(page);
  await expect(slider).toHaveValue('280');
  await expect.poll(() => columnCount(grid)).toBe(largeColumns);
});

test('image size control becomes usable after scrolling and stays visible for keyboard input', async ({ page, browserName, isMobile }) => {
  await page.goto('/picks');
  await expectCollectionReady(page);

  const control = page.locator('[data-size-control]');
  const slider = page.getByRole('slider', { name: '画像サイズ' });
  const scroll = (top: number) => browserName === 'webkit' && isMobile
    ? page.evaluate((distance) => window.scrollBy({ top: distance, behavior: 'instant' }), top)
    : page.mouse.wheel(0, top);
  await scroll(600);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(control).toHaveAttribute('data-scroll-hidden', '');
  await expect(control).not.toHaveAttribute('data-scroll-hidden');
  await expect(control).toHaveCSS('opacity', '1');

  await slider.press('Home');
  await expect(slider).toBeFocused();
  await expect(slider).toHaveValue('88');
  const beforeScroll = await page.evaluate(() => window.scrollY);
  await scroll(300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeScroll);
  await expect(control).not.toHaveAttribute('data-scroll-hidden');
  await expect(control).toHaveCSS('opacity', '1');
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('96');
});
