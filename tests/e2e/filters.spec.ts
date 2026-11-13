import type { Page } from '@playwright/test';
import { sampleCategories, sampleThings } from '../../src/data/sample';
import { test, expect, expectCollectionReady } from './fixtures';

async function expectCategory(page: Page, category = '') {
  const expectedThings = sampleThings.filter((thing) => !category
    || thing.ref_categories?.some((reference) => reference?.id === category));
  const visibleCards = page.locator('[data-item-grid] > [data-item]:visible .item-card-link');
  const filters = page.getByRole('group', { name: 'カテゴリで絞り込む' });

  await expect(visibleCards).toHaveCount(expectedThings.length);
  await expect.poll(() => visibleCards.evaluateAll((links) => links.map((link) =>
    new URL((link as HTMLAnchorElement).href).pathname,
  ))).toEqual(expectedThings.map((thing) => `/picks/things/${thing.id}`));
  await expect(filters.locator('[aria-pressed="true"]')).toHaveCount(1);
  await expect(filters.locator(`[data-filter="${category}"]`)).toHaveAttribute('aria-pressed', 'true');

  const count = String(expectedThings.length).padStart(2, '0');
  const label = sampleCategories.find((candidate) => candidate.id === category)?.name;
  await expect(page.getByRole('status')).toHaveText(category
    ? `${label} — ${count} things`
    : `${count} things, well loved.`);
}

test('カテゴリ操作で商品・選択状態・件数・URLが同期する', async ({ page, isMobile }) => {
  await page.goto('/picks');
  await expectCollectionReady(page);
  await expectCategory(page);

  const filters = page.getByRole('group', { name: 'カテゴリで絞り込む' });
  for (const category of sampleCategories) {
    const button = filters.locator(`[data-filter="${category.id}"]`);
    if (isMobile) await button.tap();
    else await button.click();
    await expect(page).toHaveURL(`/picks?category=${encodeURIComponent(category.id)}`);
    await expectCategory(page, category.id);
  }

  await filters.locator('[data-filter=""]').click();
  await expect(page).toHaveURL('/picks');
  await expectCategory(page);
});

test('カテゴリ付きURLを直接開いて再読み込みしても絞り込みを維持する', async ({ page }) => {
  await page.goto('/picks?category=ski');
  await expectCollectionReady(page);
  await expectCategory(page, 'ski');

  await page.reload();
  await expectCollectionReady(page);
  await expect(page).toHaveURL('/picks?category=ski');
  await expectCategory(page, 'ski');
});

test('不明なカテゴリは全件表示になりallを選ぶとURLも全件へ戻る', async ({ page }) => {
  await page.goto('/picks?category=unknown-category');
  await expectCollectionReady(page);
  await expectCategory(page);

  await page.getByRole('group', { name: 'カテゴリで絞り込む' }).locator('[data-filter=""]').click();
  await expect(page).toHaveURL('/picks');
  await expectCategory(page);
});

test('ブラウザの戻る・進むでカテゴリと表示結果を復元する', async ({ page }) => {
  await page.goto('/picks');
  await expectCollectionReady(page);
  const filters = page.getByRole('group', { name: 'カテゴリで絞り込む' });

  await filters.locator('[data-filter="mountain"]').click();
  await expectCategory(page, 'mountain');
  await filters.locator('[data-filter="ski"]').click();
  await expectCategory(page, 'ski');

  await page.goBack();
  await expect(page).toHaveURL('/picks?category=mountain');
  await expectCategory(page, 'mountain');
  await page.goBack();
  await expect(page).toHaveURL('/picks');
  await expectCategory(page);
  await page.goForward();
  await expect(page).toHaveURL('/picks?category=mountain');
  await expectCategory(page, 'mountain');
  await page.goForward();
  await expect(page).toHaveURL('/picks?category=ski');
  await expectCategory(page, 'ski');
});
