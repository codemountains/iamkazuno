import type { Locator } from '@playwright/test';
import { test, expect, expectCollectionReady, settingsButton } from './fixtures';

async function columnCount(grid: Locator) {
  return grid.evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
  );
}

async function expectSettingsAtTopRight(settings: Locator) {
  await expect(settings).toBeInViewport({ ratio: 1 });
  const insets = await settings.evaluate((button) => {
    const { right, top } = button.getBoundingClientRect();
    return { right: document.documentElement.clientWidth - right, top };
  });
  expect(insets).toEqual({ right: 16, top: 16 });
}

for (const initialTheme of ['light', 'dark'] as const) {
  test(`theme follows the ${initialTheme} system preference until manually selected`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: initialTheme });
    await page.goto('/picks');
    await expectCollectionReady(page);

    const root = page.locator('html');
    const toggle = page.getByRole('switch', { name: 'ダークモード' });
    await expect(root).toHaveAttribute('data-theme', initialTheme);
    await settingsButton(page).click();
    await expect(page.getByText('Appearance', { exact: true })).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', String(initialTheme === 'dark'));

    const nextTheme = initialTheme === 'light' ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: nextTheme });
    await expect(root).toHaveAttribute('data-theme', nextTheme);
    await expect(toggle).toHaveAttribute('aria-checked', String(nextTheme === 'dark'));
  });
}

test('manual theme choice survives navigation and reload, independently of OS changes', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/picks');
  await expectCollectionReady(page);

  const toggle = page.getByRole('switch', { name: 'ダークモード' });
  const settings = settingsButton(page);
  await settings.click();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await settings.click();
  await page.getByRole('link', { name: 'ブーツ', exact: true }).click();
  await expect(page).toHaveURL(/\/picks\/things\/mountain-boots\/?$/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await settings.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('slider', { name: '画像サイズ' })).toBeHidden();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await settings.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await settings.click();
  await page.getByRole('link', { name: 'Back to picks', exact: true }).click();
  await expectCollectionReady(page);
  await settings.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('image size controls the actual grid and persists through detail navigation and reload', async ({
  page,
  isMobile,
}) => {
  await page.goto('/picks');
  await expectCollectionReady(page);

  const settings = settingsButton(page);
  await settings.click();
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
  await expect
    .poll(() => firstCard.evaluate((element) => element.getBoundingClientRect().width))
    .toBeLessThan(initialWidth);
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
  await expect
    .poll(() => firstCard.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(smallWidth);
  if (isMobile) await expect.poll(() => columnCount(grid)).toBe(1);
  else await expect.poll(() => columnCount(grid)).toBeLessThan(smallColumns);
  const largeColumns = await columnCount(grid);

  await settings.click();
  await page.getByRole('link', { name: 'ブーツ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ブーツ', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to picks', exact: true }).click();
  await expectCollectionReady(page);
  await expect.poll(() => columnCount(grid)).toBe(largeColumns);
  await settings.click();
  await expect(slider).toHaveValue('280');
  await page.reload();
  await expectCollectionReady(page);
  await expect.poll(() => columnCount(grid)).toBe(largeColumns);
  await settings.click();
  await expect(slider).toHaveValue('280');
});

test('display settings scroll with the page and support keyboard dismissal', async ({
  page,
  browserName,
}) => {
  await page.goto('/picks');
  await expectCollectionReady(page);

  const settings = settingsButton(page);
  const toggle = page.getByRole('switch', { name: 'ダークモード' });
  const slider = page.getByRole('slider', { name: '画像サイズ' });
  // WebKitの既定設定では、ボタンを含む全コントロールへの移動はOption+Tab。
  const nextControl = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await expectSettingsAtTopRight(settings);
  await expect(settings).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeHidden();
  await expect(slider).toBeHidden();
  await settings.press(nextControl);
  await expect(page.locator('[data-filter=""]')).toBeFocused();

  await settings.press('Enter');
  await expect(settings).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press(nextControl);
  await expect(toggle).toBeFocused();
  await page.keyboard.press(nextControl);
  await expect(slider).toBeFocused();
  await expect(slider).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('248');
  await page.keyboard.press('Escape');
  await expect(settings).toHaveAttribute('aria-expanded', 'false');
  await expect(settings).toBeFocused();
  await expect(slider).toBeHidden();

  await settings.click();
  await expect(slider).toHaveValue('248');
  await page.getByRole('group', { name: 'カテゴリで絞り込む' }).getByRole('button').first().click();
  await expect(settings).toHaveAttribute('aria-expanded', 'false');

  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  await expect(settings).not.toBeInViewport();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expectSettingsAtTopRight(settings);
});

test('home, notes, detail and not-found pages offer theme settings in the same corner', async ({
  page,
}) => {
  for (const path of ['/', '/notes', '/picks/things/mountain-boots', '/missing-settings-test']) {
    await page.goto(path);
    const settings = settingsButton(page);
    await expectSettingsAtTopRight(settings);
    await settings.click();
    await expect(page.getByRole('switch', { name: 'ダークモード' })).toBeVisible();
    await expect(page.getByRole('slider', { name: '画像サイズ' })).toBeHidden();
  }
});
