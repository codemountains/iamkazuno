import { test as base, expect, type Page } from '@playwright/test';

// DOMが表示されても操作用moduleの初期化は終わっていない場合がある。
export async function expectCollectionReady(page: Page) {
  await expect(page.getByRole('group', { name: 'カテゴリで絞り込む' })).toBeVisible();
  await expect(page.getByRole('slider', { name: '画像サイズ' })).toBeVisible();
  await expect(page.locator('[data-size-control]')).toHaveAttribute('data-size-ready', 'true');
}

export const test = base.extend<{ browserErrors: void }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    const onError = (error: Error) => errors.push(error.message);
    page.on('pageerror', onError);
    await use();
    page.off('pageerror', onError);
    expect(errors, 'ブラウザで未処理のJavaScriptエラーが発生しない').toEqual([]);
  }, { auto: true }],
});

export { expect };
