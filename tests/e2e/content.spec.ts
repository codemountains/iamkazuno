import { test, expect, expectCollectionReady } from './fixtures';

test('variant labels follow the product name and use square brackets in page titles', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/picks');
  const item = page.getByRole('link', { name: 'スキー板 25-26', exact: true });
  const cardLabel = item.locator('.thing-variant');
  await expect(cardLabel).toHaveText('25-26');
  await expect(cardLabel).toHaveCSS('font-size', '12px');
  await expect(cardLabel).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await item.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName('スキー板 25-26');
  const label = page.locator('h1 .thing-variant');
  await expect(label).toHaveText('25-26');
  await expect(label).toHaveCSS('font-size', '14px');
  await expect(label).toHaveCSS('border-radius', '5px');
  await expect(page.locator('h1 .thing-name')).toHaveCSS('margin-inline-end', '4px');
  await expect(page).toHaveTitle('スキー板 [25-26] — /picks');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'スキー板 [25-26] — /picks',
  );
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://iamkaz.uno/picks/things/ski-skis',
  );
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(label).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  await page.goto('/picks/things/mountain-boots');
  await expect(page).toHaveTitle('ブーツ — /picks');
  await expect(page.locator('h1 .thing-variant')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'スキー板 25-26', exact: true })).toHaveAttribute(
    'href',
    '/picks/things/ski-skis',
  );
});

test('items without images open from the collection and show a placeholder on the detail page', async ({
  page,
}) => {
  await page.goto('/picks?category=ski');
  await expectCollectionReady(page);
  const item = page.getByRole('link', { name: '画像未設定のサンプル', exact: true });
  await expect(
    item.getByRole('img', { name: '画像未設定のサンプルの画像は未登録です' }),
  ).toBeVisible();
  await item.click();
  await expect(page).toHaveURL('/picks/things/sample-no-image');
  await expect(
    page.getByRole('heading', { name: '画像未設定のサンプル', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: '画像未設定のサンプルの画像は未登録です' }),
  ).toBeVisible();
  await expect(page.getByText('No image yet', { exact: true })).toBeVisible();
});

test('detail pages remain available when the brand or description is missing', async ({ page }) => {
  await page.goto('/picks/things/sample-no-brand');
  await expect(
    page.getByRole('heading', { name: 'ブランド未設定のサンプル', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.detail-brand')).toHaveCount(0);

  await page.goto('/picks/things/sample-no-description');
  await expect(
    page.getByRole('heading', { name: '説明未設定のサンプル', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.detail-description')).toHaveCount(0);
  await expect(page.getByText('No description yet.', { exact: true })).toHaveCount(0);
});

test('the uncategorized item at the end of the collection is reachable', async ({ page }) => {
  await page.goto('/picks');
  await expectCollectionReady(page);
  const lastItem = page
    .locator('[data-item]')
    .last()
    .getByRole('link', { name: 'カテゴリ未設定のサンプル', exact: true });
  await lastItem.scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await lastItem.click();
  await expect(page).toHaveURL('/picks/things/sample-uncategorized');
  await expect(
    page.getByRole('heading', { name: 'カテゴリ未設定のサンプル', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('list', { name: 'カテゴリ', exact: true })).toHaveCount(0);
});

test('collection and detail pages include their description in search and sharing metadata', async ({
  page,
}) => {
  const descriptions = [
    ['/picks', /登山.*スキー.*スノーボード.*MYOG/],
    [
      '/picks/things/mountain-boots',
      'いつもの登山道から、まだ歩いたことのない稜線へ。 土や岩の感触を確かめながら、一歩ずつ進む。山を歩く時間をともにする、足元の道具。',
    ],
    [
      '/picks/things/sample-no-description',
      'SAMPLE OBJECTSの「説明未設定のサンプル」を「other」の持ち物として紹介します。',
    ],
  ] as const;
  for (const [path, description] of descriptions) {
    await page.goto(path);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', description);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      'content',
      description,
    );
  }
});
