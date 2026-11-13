import { test, expect, expectCollectionReady } from './fixtures';

test('items without images open from the collection and show a placeholder on the detail page', async ({ page }) => {
  await page.goto('/picks?category=ski');
  await expectCollectionReady(page);
  const item = page.getByRole('link', { name: '画像未設定のサンプル', exact: true });
  await expect(item.getByRole('img', { name: '画像未設定のサンプルの画像は未登録です' })).toBeVisible();
  await item.click();
  await expect(page).toHaveURL('/picks/things/sample-no-image');
  await expect(page.getByRole('heading', { name: '画像未設定のサンプル', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: '画像未設定のサンプルの画像は未登録です' })).toBeVisible();
  await expect(page.getByText('No image yet', { exact: true })).toBeVisible();
});

test('detail pages remain available when the brand or description is missing', async ({ page }) => {
  await page.goto('/picks/things/sample-no-brand');
  await expect(page.getByRole('heading', { name: 'ブランド未設定のサンプル', exact: true })).toBeVisible();
  await expect(page.locator('.detail-brand')).toHaveCount(0);

  await page.goto('/picks/things/sample-no-description');
  await expect(page.getByRole('heading', { name: '説明未設定のサンプル', exact: true })).toBeVisible();
  await expect(page.getByText('No description yet.', { exact: true })).toBeVisible();
});

test('the uncategorized item at the end of the collection is reachable', async ({ page }) => {
  await page.goto('/picks');
  await expectCollectionReady(page);
  const lastItem = page.locator('[data-item]').last().getByRole('link', { name: 'カテゴリ未設定のサンプル', exact: true });
  await lastItem.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await lastItem.click();
  await expect(page).toHaveURL('/picks/things/sample-uncategorized');
  await expect(page.getByRole('heading', { name: 'カテゴリ未設定のサンプル', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'カテゴリ', exact: true })).toHaveCount(0);
});
