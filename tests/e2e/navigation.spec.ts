import type { Locator, Page } from '@playwright/test';
import { sampleThings } from '../../src/data/sample';
import { test, expect, expectCollectionReady } from './fixtures';

async function expectImageLoaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
    element.complete && element.naturalWidth > 0,
  )).toBe(true);
}

async function openScrolledDetail(page: Page) {
  const mountainThings = sampleThings.filter((thing) =>
    thing.ref_categories?.some((category) => category?.id === 'mountain'));
  // PCでもモバイルでも、先頭viewport外の末尾の商品まで実際にスクロールする。
  const thing = mountainThings.at(-1)!;
  const detailPath = `/picks/things/${thing.id}`;

  await page.goto('/picks?category=mountain');
  await expectCollectionReady(page);
  await page.evaluate(() => document.fonts.ready);
  const item = page.locator(`[data-item-grid] > [data-item]:has(a[href="${detailPath}"])`);
  const link = item.getByRole('link');
  await link.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const itemTop = (await item.boundingBox())!.y;

  await link.click();
  await expect(page).toHaveURL(detailPath);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(thing.name || 'Unnamed item');
  await expect(page.getByRole('link', { name: 'Back to picks' })).toHaveAttribute('href', '/picks?category=mountain');
  return { detailPath, itemTop };
}

async function expectRestoredItem(page: Page, detailPath: string, itemTop: number) {
  await expect(page).toHaveURL('/picks?category=mountain');
  await expectCollectionReady(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-filter="mountain"]')).toHaveAttribute('aria-pressed', 'true');
  const item = page.locator(`[data-item-grid] > [data-item]:has(a[href="${detailPath}"])`);
  await expect(item).toBeInViewport();
  await expect.poll(async () => {
    const box = await item.boundingBox();
    return box ? Math.abs(box.y - itemTop) : Number.POSITIVE_INFINITY;
  }).toBeLessThanOrEqual(4);
}

test('トップから一覧と詳細へ移動でき、商品画像と説明を表示する', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'iamkaz.uno' })).toBeVisible();
  await page.getByRole('link', { name: '/picks', exact: true }).click();
  await expect(page).toHaveURL('/picks');
  await expectCollectionReady(page);

  const boots = page.getByRole('link', { name: 'ブーツ', exact: true });
  await expectImageLoaded(boots.getByRole('img'));
  await boots.click();
  await expect(page).toHaveURL('/picks/things/mountain-boots');
  await expect(page.getByRole('heading', { level: 1, name: 'ブーツ', exact: true })).toBeVisible();
  await expectImageLoaded(page.locator('.detail-image-wrap img'));
  await expect(page.getByText('いつもの登山道から、まだ歩いたことのない稜線へ。', { exact: true })).toBeVisible();

  await page.getByRole('list', { name: 'カテゴリ', exact: true }).getByRole('link', { name: 'mountain', exact: true }).click();
  await expect(page).toHaveURL('/picks?category=mountain');
  await expectCollectionReady(page);
  await expect(page.locator('[data-filter="mountain"]')).toHaveAttribute('aria-pressed', 'true');
});

test('詳細を再読み込みしてから戻ってもカテゴリと商品の画面内位置を復元する', async ({ page }) => {
  const { detailPath, itemTop } = await openScrolledDetail(page);
  await page.reload();
  const backLink = page.getByRole('link', { name: 'Back to picks' });
  await expect(backLink).toHaveAttribute('href', '/picks?category=mountain');
  await backLink.click();
  await expectRestoredItem(page, detailPath, itemTop);
});

test('一覧と詳細をブラウザの戻る・進むで移動しても閲覧状態を維持する', async ({ page }) => {
  const { detailPath, itemTop } = await openScrolledDetail(page);
  await page.goBack();
  await expectRestoredItem(page, detailPath, itemTop);
  await page.goForward();
  await expect(page).toHaveURL(detailPath);
  const backLink = page.getByRole('link', { name: 'Back to picks' });
  await expect(backLink).toHaveAttribute('href', '/picks?category=mountain');
  await backLink.click();
  await expectRestoredItem(page, detailPath, itemTop);
});

test('詳細URLを直接開いた場合は全件一覧の先頭へ戻る', async ({ page }) => {
  await page.goto('/picks/things/mountain-boots');
  const backLink = page.getByRole('link', { name: 'Back to picks' });
  await expect(backLink).toHaveAttribute('href', '/picks');
  await backLink.click();
  await expect(page).toHaveURL('/picks');
  await expectCollectionReady(page);
  await expect(page.locator('[data-filter=""]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-item-grid] > [data-item]:visible')).toHaveCount(sampleThings.length);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
