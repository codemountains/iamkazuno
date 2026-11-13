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

test('category changes keep items, selection, counts, and the URL in sync', async ({ page, isMobile }) => {
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

test('a category URL applies its filter on direct visits and reloads', async ({ page }) => {
  await page.goto('/picks?category=ski');
  await expectCollectionReady(page);
  await expectCategory(page, 'ski');

  await page.reload();
  await expectCollectionReady(page);
  await expect(page).toHaveURL('/picks?category=ski');
  await expectCategory(page, 'ski');
});

test('an unknown category shows all items and selecting all clears the category URL', async ({ page }) => {
  await page.goto('/picks?category=unknown-category');
  await expectCollectionReady(page);
  await expectCategory(page);

  await page.getByRole('group', { name: 'カテゴリで絞り込む' }).locator('[data-filter=""]').click();
  await expect(page).toHaveURL('/picks');
  await expectCategory(page);
});

test('browser back and forward restore the selected category and visible items', async ({ page }) => {
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
