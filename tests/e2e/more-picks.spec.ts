import type { Locator, Page } from '@playwright/test';
import { test, expect, expectCollectionReady } from './fixtures';

const bootsPath = '/picks/things/mountain-boots';
const backpackPath = '/picks/things/mountain-backpack';
const watchPath = '/picks/things/mountain-watch';
const configuredIds = [
  'mountain-backpack',
  'mountain-watch',
  'ski-skis',
  'ski-goggles',
  'myog-tote',
  'myog-stuff-sack',
  'other-camera',
  'sample-no-image',
  'sample-no-brand',
];

const morePicks = (page: Page) => page.getByRole('region', { name: 'More picks', exact: true });
const track = (page: Page) => morePicks(page).locator('[data-more-picks-track]');
const relatedLink = (page: Page, path: string) => morePicks(page).locator(`a[href="${path}"]`);

async function expectImageLoaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (element: HTMLImageElement) =>
          element.complete && element.naturalWidth > 1 && !element.currentSrc.startsWith('data:'),
      ),
    )
    .toBe(true);
}

async function openFromScrolledCollection(page: Page) {
  await page.goto('/picks?category=mountain');
  await expectCollectionReady(page);
  await page.evaluate(() => document.fonts.ready);
  const item = page.locator(`[data-item-grid] > [data-item]:has(a[href="${bootsPath}"])`);
  await page.evaluate(() => window.scrollTo({ top: 150, behavior: 'instant' }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const itemTop = (await item.boundingBox())!.y;
  await item.getByRole('link').click();
  await expect(page).toHaveURL(bootsPath);
  await expect(page.getByRole('link', { name: 'Back to picks' })).toHaveAttribute(
    'href',
    '/picks?category=mountain',
  );
  return itemTop;
}

async function expectOriginalCollection(page: Page, itemTop: number, restoreFocus = false) {
  await expect(page).toHaveURL('/picks?category=mountain');
  await expectCollectionReady(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-filter="mountain"]')).toHaveAttribute('aria-pressed', 'true');
  const item = page.locator(`[data-item-grid] > [data-item]:has(a[href="${bootsPath}"])`);
  await expect(item).toBeInViewport();
  await expect
    .poll(async () => Math.abs((await item.boundingBox())!.y - itemTop))
    .toBeLessThanOrEqual(4);
  if (restoreFocus) await expect(item.getByRole('link')).toBeFocused();
}

test('More picks preserves the configured order and displays all nine items', async ({ page }) => {
  await page.goto(bootsPath);
  const section = morePicks(page);
  await expect(section.getByRole('heading', { level: 2, name: 'More picks' })).toBeVisible();
  await expect(section.getByRole('heading', { level: 3 })).toHaveCount(configuredIds.length);
  const links = track(page).locator('.item-card-link');
  await expect(links).toHaveCount(configuredIds.length);
  expect(
    await links.evaluateAll((elements) => elements.map((element) => element.getAttribute('href'))),
  ).toEqual(configuredIds.map((id) => `/picks/things/${id}`));
  await expect(section.locator(`a[href="${bootsPath}"]`)).toHaveCount(0);
  await expect(
    relatedLink(page, '/picks/things/sample-no-image').getByRole('img', {
      name: '画像未設定のサンプルの画像は未登録です',
    }),
  ).toHaveCount(1);
  await expect(
    relatedLink(page, '/picks/things/sample-no-brand').locator('.item-brand'),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('horizontal scrolling reveals loaded images and usable detail links', async ({
  page,
  isMobile,
}) => {
  await page.goto(bootsPath);
  const row = track(page);
  await row.scrollIntoViewIfNeeded();
  const last = row.locator('.item-card-link').last();
  await expect(last).not.toBeInViewport();
  await row.evaluate((element) =>
    element.scrollTo({ left: element.scrollWidth, behavior: 'instant' }),
  );
  await expect.poll(() => row.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(last).toBeInViewport();
  await expectImageLoaded(last.locator('.item-image-wrap img'));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  if (isMobile) await last.tap();
  else await last.click();
  await expect(page).toHaveURL('/picks/things/sample-no-brand');
  // 一覧を経由しない詳細巡回では、カテゴリや過去の一覧位置を作らない。
  await expect(page.getByRole('link', { name: 'Back to picks' })).toHaveAttribute('href', '/picks');
});

test('the progress bar and lower arrow controls follow the visible cards', async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(bootsPath);
  const section = morePicks(page);
  const row = track(page);
  const controls = section.locator('[data-more-picks-controls]');
  const progress = section.getByRole('progressbar', { name: 'More picks の表示位置' });
  const previous = section.getByRole('button', { name: '前のアイテムを表示' });
  const next = section.getByRole('button', { name: '次のアイテムを表示' });
  const progressValue = () => progress.evaluate((element: HTMLProgressElement) => element.value);
  const activate = (button: Locator) => (isMobile ? button.tap() : button.click());
  await expect(controls).toBeVisible();
  await expect(progress).toBeVisible();
  await expect(previous).toBeVisible();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  const initialProgress = await progressValue();
  expect(initialProgress).toBeGreaterThan(0);
  expect(initialProgress).toBeLessThan(1);
  const rowBounds = (await row.boundingBox())!;
  const controlsBounds = (await controls.boundingBox())!;
  const progressBounds = (await progress.boundingBox())!;
  const previousBounds = (await previous.boundingBox())!;
  expect(controlsBounds.y).toBeGreaterThanOrEqual(rowBounds.y + rowBounds.height);
  expect(previousBounds.x).toBeGreaterThan(progressBounds.x + progressBounds.width);

  await activate(next);
  await expect.poll(() => row.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(progressValue).toBeGreaterThan(initialProgress);
  await expect(previous).toBeEnabled();
  await row.evaluate((element) =>
    element.scrollTo({ left: element.scrollWidth, behavior: 'instant' }),
  );
  await expect(next).toBeDisabled();
  await expect.poll(progressValue).toBeCloseTo(1, 3);
  await activate(previous);
  await expect(next).toBeEnabled();
  await expect.poll(progressValue).toBeLessThan(1);
  await row.evaluate((element) => element.scrollTo({ left: 0, behavior: 'instant' }));
  await expect(previous).toBeDisabled();
  await expect.poll(progressValue).toBeCloseTo(initialProgress, 3);
});

test('the progress bar adapts when the viewport changes width', async ({ page }) => {
  await page.goto(bootsPath);
  const progress = morePicks(page).getByRole('progressbar', { name: 'More picks の表示位置' });
  await expect(progress).toBeVisible();
  const initialProgress = await progress.evaluate((element: HTMLProgressElement) => element.value);
  const originalViewport = page.viewportSize()!;
  const wider = originalViewport.width <= 600;
  await page.setViewportSize({ ...originalViewport, width: wider ? 1280 : 390 });
  const progressValue = () => progress.evaluate((element: HTMLProgressElement) => element.value);
  if (wider) await expect.poll(progressValue).toBeGreaterThan(initialProgress);
  else await expect.poll(progressValue).toBeLessThan(initialProgress);
  await expect(morePicks(page).getByRole('button', { name: '前のアイテムを表示' })).toBeDisabled();
  await expect(morePicks(page).getByRole('button', { name: '次のアイテムを表示' })).toBeEnabled();
});

test('keyboard focus reveals offscreen cards and Enter opens their detail', async ({
  page,
  browserName,
}) => {
  await page.goto(bootsPath);
  const links = track(page).locator('.item-card-link');
  await links.first().focus();
  // WebKit の既定設定では、リンクを含めた順次移動に Option（Alt）+Tab を使う。
  const nextFocusKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  for (let index = 1; index < configuredIds.length; index += 1)
    await page.keyboard.press(nextFocusKey);
  const last = links.last();
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
  await expect.poll(() => track(page).evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  // フォーカス先のカード全体が横方向に収まることを確認する。
  await expect
    .poll(async () => {
      const rowBox = (await track(page).boundingBox())!;
      const cardBox = (await last.boundingBox())!;
      return cardBox.x >= rowBox.x - 1 && cardBox.x + cardBox.width <= rowBox.x + rowBox.width + 1;
    })
    .toBe(true);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/picks/things/sample-no-brand');
});

test('multiple related visits and a reload preserve the original category, position, and keyboard focus', async ({
  page,
}) => {
  const itemTop = await openFromScrolledCollection(page);
  await relatedLink(page, backpackPath).click();
  await expect(page).toHaveURL(backpackPath);
  await relatedLink(page, watchPath).click();
  await expect(page).toHaveURL(watchPath);
  await page.reload();
  const back = page.getByRole('link', { name: 'Back to picks' });
  await expect(back).toHaveAttribute('href', '/picks?category=mountain');
  await back.press('Enter');
  await expectOriginalCollection(page, itemTop, true);
});

test('browser history keeps the original return destination while revisiting related details', async ({
  page,
}) => {
  const itemTop = await openFromScrolledCollection(page);
  await relatedLink(page, backpackPath).click();
  await expect(page).toHaveURL(backpackPath);
  await page.goBack();
  await expect(page).toHaveURL(bootsPath);
  await expect(page.getByRole('link', { name: 'Back to picks' })).toHaveAttribute(
    'href',
    '/picks?category=mountain',
  );
  await page.goForward();
  await expect(page).toHaveURL(backpackPath);
  await page.getByRole('link', { name: 'Back to picks' }).click();
  await expectOriginalCollection(page, itemTop);
});

test('an unset field hides More picks and one configured item does not overflow', async ({
  page,
}) => {
  await page.goto(watchPath);
  await expect(morePicks(page)).toHaveCount(0);
  await page.goto(backpackPath);
  await expect(track(page).locator('.item-card-link')).toHaveCount(1);
  expect(await track(page).evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  await expect(morePicks(page).locator('[data-more-picks-controls]')).toBeHidden();
});

test('a touch swipe scrolls the cards without accidentally opening one', async ({
  page,
  context,
  browserName,
  isMobile,
}) => {
  test.skip(
    browserName !== 'chromium' || !isMobile,
    'CDP の実タッチ入力は mobile Chromium で検証する。',
  );
  await page.goto(bootsPath);
  const row = track(page);
  await row.scrollIntoViewIfNeeded();
  const bounds = (await row.boundingBox())!;
  const x = bounds.x + bounds.width * 0.85;
  const y = bounds.y + Math.min(70, bounds.height / 2);
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let step = 1; step <= 8; step += 1) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x - (bounds.width * 0.65 * step) / 8, y }],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await expect.poll(() => row.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(page).toHaveURL(bootsPath);
  await expect(row.locator('[data-pressed]')).toHaveCount(0);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('More picks images, horizontal scrolling, and links remain available', async ({ page }) => {
    await page.goto(bootsPath);
    const row = track(page);
    await expect(row.locator('.item-card-link')).toHaveCount(configuredIds.length);
    await expect(morePicks(page).locator('[data-more-picks-controls]')).toBeHidden();
    await row.scrollIntoViewIfNeeded();
    await row.evaluate((element) =>
      element.scrollTo({ left: element.scrollWidth, behavior: 'instant' }),
    );
    const last = row.locator('.item-card-link').last();
    await expectImageLoaded(last.locator('.item-image-wrap img'));
    await last.click();
    await expect(page).toHaveURL('/picks/things/sample-no-brand');
  });
});
