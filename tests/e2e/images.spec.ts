import type { Locator } from '@playwright/test';
import { sampleThings } from '../../src/data/sample';
import { test, expect, expectCollectionReady } from './fixtures';

async function expectImageLoaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
    !element.hasAttribute('data-image-src')
      && !element.currentSrc.startsWith('data:')
      && element.complete && element.naturalWidth > 1,
  )).toBe(true);
}

test('distant images stay deferred until scrolling near them', async ({ page }) => {
  await page.goto('/picks');
  await expectCollectionReady(page);
  const images = page.locator('[data-collection-image]');
  await expectImageLoaded(images.first());

  const distantImage = images.last();
  await expect(distantImage).not.toBeInViewport();
  await expect(distantImage).toHaveAttribute('data-image-src', '/images/samples/sample.svg');
  await expect(distantImage).toHaveAttribute('src', /^data:image\/gif/);
  await distantImage.scrollIntoViewIfNeeded();
  await expectImageLoaded(distantImage);
});

test('a category URL prioritizes its first four images and leaves excluded images deferred', async ({ page }) => {
  await page.goto('/picks?category=ski');
  await expectCollectionReady(page);
  const selectedImages = page.locator('[data-item-grid] > [data-item]:visible [data-collection-image]');
  for (let index = 0; index < 4; index += 1) {
    const image = selectedImages.nth(index);
    await expectImageLoaded(image);
    await expect(image).toHaveAttribute('loading', 'eager');
    await expect(image).toHaveAttribute('fetchpriority', 'high');
  }

  const excludedImages = page.locator('[data-item-grid] > [data-item][hidden] [data-collection-image]');
  expect(await excludedImages.count()).toBeGreaterThan(0);
  expect(await excludedImages.evaluateAll((images) => images.every((image) =>
    image.hasAttribute('data-image-src') && image.getAttribute('src')?.startsWith('data:'),
  ))).toBe(true);
});

test('switching categories loads newly visible images', async ({ page }) => {
  await page.goto('/picks?category=ski');
  await expectCollectionReady(page);
  const bootsImage = page.locator('a[href="/picks/things/mountain-boots"] [data-collection-image]');
  await expect(bootsImage).toHaveAttribute('data-image-src', '/images/samples/sample.svg');

  await page.getByRole('group', { name: 'カテゴリで絞り込む' }).locator('[data-filter="mountain"]').click();
  await expect(page).toHaveURL('/picks?category=mountain');
  await expectImageLoaded(bootsImage);
});

test('initial and scrolled images load when external JavaScript modules are unavailable', async ({ page }) => {
  await page.route(/\/_astro\/[^/]+\.js(?:\?.*)?$/, (route) => route.abort());
  await page.goto('/picks');
  const images = page.locator('[data-item-grid] > [data-item]:visible [data-collection-image]');
  await expectImageLoaded(images.first());
  const distantImage = images.last();
  await expect(distantImage).toHaveAttribute('data-image-src', '/images/samples/sample.svg');
  await distantImage.scrollIntoViewIfNeeded();
  await expectImageLoaded(distantImage);
});

test('images remain available when IntersectionObserver is unsupported', async ({ page }) => {
  await page.addInitScript(() => { Reflect.deleteProperty(window, 'IntersectionObserver'); });
  await page.goto('/picks');
  await expectCollectionReady(page);
  const images = page.locator('[data-collection-image]');
  await expectImageLoaded(images.first());
  await images.last().scrollIntoViewIfNeeded();
  await expectImageLoaded(images.last());
});

test('mobile size adjustments defer new images until the final size is committed', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile column changes defer image selection until the gesture ends.');
  await page.addInitScript(() => sessionStorage.setItem('picks:image-size', '232'));
  await page.goto('/picks');
  await expectCollectionReady(page);
  await page.evaluate(() => document.fonts.ready);
  const grid = page.locator('[data-item-grid]');
  const images = page.locator('[data-collection-image]');
  const slider = page.getByRole('slider', { name: '画像サイズ' });
  const columnCount = () => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  await expect.poll(columnCount).toBe(2);
  await expectImageLoaded(images.first());
  const initialSizes = await images.first().getAttribute('sizes');
  expect(initialSizes).toMatch(/^\d+px$/);

  // 2列では画面外、6列では画面内になる未取得画像を追跡する。
  const deferredIndex = await images.evaluateAll((elements) => elements.findIndex((image) =>
    image.hasAttribute('data-image-src') && image.getBoundingClientRect().top > innerHeight + 240,
  ));
  expect(deferredIndex).toBeGreaterThan(0);
  const newlyVisibleImage = images.nth(deferredIndex);
  const inputSize = (value: number, commit = false) => slider.evaluate(async (element: HTMLInputElement, input) => {
    element.value = String(input.value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    if (input.commit) element.dispatchEvent(new Event('change', { bubbles: true }));
    // レイアウト更新とIntersectionObserverの通知が実際に走るまで待つ。
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }, { value, commit });

  await inputSize(88);
  await expect.poll(columnCount).toBe(6);
  await expect(newlyVisibleImage).toBeInViewport();
  await expect(newlyVisibleImage).toHaveAttribute('data-image-src', '/images/samples/sample.svg');

  await inputSize(232, true);
  await expect.poll(columnCount).toBe(2);
  await expect.poll(() => images.evaluateAll((elements, expectedSizes) => elements
    .filter((image) => !image.hasAttribute('data-image-src'))
    .every((image) => image.getAttribute('sizes') === expectedSizes), initialSizes,
  )).toBe(true);
  await expect(newlyVisibleImage).toHaveAttribute('data-image-src', '/images/samples/sample.svg');

  // 6列で確定した場合は、途中で保留した画像を最終サイズで取得する。
  await inputSize(88, true);
  await expect.poll(columnCount).toBe(6);
  await expectImageLoaded(newlyVisibleImage);
  const finalSizes = await images.first().getAttribute('sizes');
  expect(finalSizes).not.toBe(initialSizes);
  await expect(newlyVisibleImage).toHaveAttribute('sizes', finalSizes!);
});

test('returning from a distant detail page restores a loaded collection image', async ({ page }) => {
  await page.goto('/picks');
  await expectCollectionReady(page);
  const link = page.locator('a[href="/picks/things/sample-uncategorized"]');
  await link.scrollIntoViewIfNeeded();
  await expectImageLoaded(link.locator('[data-collection-image]'));
  await link.click();
  await expect(page).toHaveURL('/picks/things/sample-uncategorized');
  await page.reload();
  await page.getByRole('link', { name: 'Back to picks' }).click();

  await expect(page).toHaveURL('/picks');
  await expectCollectionReady(page);
  await expect(link).toBeInViewport();
  await expectImageLoaded(link.locator('[data-collection-image]'));
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('each illustrated card has one visible image supplied by the fallback', async ({ page }) => {
    await page.goto('/picks');
    const images = page.locator('[data-item] .item-image-wrap img:visible');
    await expect(images).toHaveCount(sampleThings.filter((thing) => thing.main_image).length);
    expect(await page.locator('[data-item] .item-image-wrap').evaluateAll((wrappers) => wrappers.every((wrapper) =>
      Array.from(wrapper.querySelectorAll('img')).filter((image) => image.getClientRects().length > 0).length <= 1,
    ))).toBe(true);
    await expectImageLoaded(images.first());
    await images.last().scrollIntoViewIfNeeded();
    await expectImageLoaded(images.last());
  });
});
