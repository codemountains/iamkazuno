import { sampleThings } from '../../src/data/sample';
import { test, expect, expectCollectionReady } from './fixtures';

test('keyboard users can skip the header, filter, open a detail, and return focus to the item', async ({ page }) => {
  await page.goto('/picks');
  await expectCollectionReady(page);

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content', exact: true });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/picks#main$/);

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^all(?:\s|\d|$)/ })).toBeFocused();
  await page.keyboard.press('Tab');
  const mountain = page.getByRole('button', { name: /^mountain(?:\s|\d|$)/ });
  await expect(mountain).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(mountain).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveURL((url) => url.searchParams.get('category') === 'mountain');

  const boots = page.getByRole('link', { name: 'ブーツ', exact: true });
  await boots.focus();
  await boots.press('Enter');
  await expect(page.getByRole('heading', { name: 'ブーツ', exact: true })).toBeVisible();
  const back = page.getByRole('link', { name: 'Back to picks', exact: true });
  await expect(back).toHaveAttribute('href', /\/picks\?category=mountain$/);
  await back.press('Enter');
  await expectCollectionReady(page);
  await expect(mountain).toHaveAttribute('aria-pressed', 'true');
  await expect(boots).toBeFocused();
  await expect(boots).toBeInViewport();
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('all items and their detail pages remain available while interactive controls stay hidden', async ({ page }) => {
    await page.goto('/picks?category=ski');
    await expect(page.locator('[data-item]:visible')).toHaveCount(sampleThings.length);
    await expect(page.getByText('Showing all items.', { exact: true })).toBeVisible();
    await expect(page.locator('[data-filter-navigation]')).toBeHidden();
    await expect(page.locator('[data-size-control]')).toBeHidden();
    await expect(page.locator('[data-theme-toggle]')).toBeHidden();

    await page.getByRole('link', { name: 'ブーツ', exact: true }).click();
    await expect(page).toHaveURL(/\/picks\/things\/mountain-boots\/?$/);
    await expect(page.getByRole('heading', { name: 'ブーツ', exact: true })).toBeVisible();
    await expect(page.getByText('いつもの登山道から、まだ歩いたことのない稜線へ。', { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: '靴紐と厚いソールを備えた登山用ブーツのイラスト' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to picks', exact: true }).click();
    await expect(page).toHaveURL(/\/picks\/?$/);
    await expect(page.locator('[data-item]:visible')).toHaveCount(sampleThings.length);
  });
});
