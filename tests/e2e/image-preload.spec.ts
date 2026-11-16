import type { Page } from '@playwright/test';
import { Parser } from 'htmlparser2';
import sharp from 'sharp';
import { sampleThings } from '../../src/data/sample';
import { test, expect, expectCollectionReady } from './fixtures';

const cdnOrigin = 'https://images.microcms-assets.io';
const imageUrl = (id: string) => `${cdnOrigin}/assets/preload-test/${id}.png`;
const imageBody = sharp({ create: { width: 640, height: 640, channels: 4, background: '#e7e7e5' } })
  .avif().toBuffer();

function attribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

// sampleはSVG共用のため、画像データだけを商品別のCDN画像へ置き換える。
// 実際のinline script・CSS・CSPヘッダーは変更せず、本番のpicture構造を使う。
function withCdnImages(html: string) {
  const edits: Array<{ start: number; end: number; replacement: string }> = [];
  let itemId = '';
  const parser = new Parser({
    onopentag(name, attributes) {
      const original = html.slice(parser.startIndex, parser.endIndex + 1);
      if (name === 'script' && Object.hasOwn(attributes, 'data-image-preload')) {
        const entries = JSON.parse(attributes['data-images']) as Array<[string, { url: string; width: number } | null]>;
        const images = entries.map(([category, image]) => {
          const thing = sampleThings.find((entry) => entry.main_image && (!category
            || entry.ref_categories?.some((entry) => entry?.id === category)));
          return [category, image && thing ? { ...image, url: imageUrl(thing.id) } : null];
        });
        edits.push({
          start: parser.startIndex,
          end: parser.endIndex + 1,
          replacement: original.replace(/data-images=(?:"[^"]*"|'[^']*')/, `data-images="${attribute(JSON.stringify(images))}"`),
        });
      }
      if (name === 'a' && attributes.href?.startsWith('/picks/things/')) {
        itemId = attributes.href.slice('/picks/things/'.length);
      }
      if (name === 'img' && Object.hasOwn(attributes, 'data-collection-image')) {
        edits.push({
          start: parser.startIndex,
          end: parser.endIndex + 1,
          replacement: '<source type="image/avif" sizes="auto, 240px">'
            + original.replace(/data-image-src=(?:"[^"]*"|'[^']*')/, `data-image-src="${imageUrl(itemId)}"`),
        });
      }
    },
  });
  parser.end(html);
  for (const edit of edits.reverse()) html = html.slice(0, edit.start) + edit.replacement + html.slice(edit.end);
  return html;
}

async function installCdnImages(page: Page) {
  const requests: string[] = [];
  await page.route(`${cdnOrigin}/assets/preload-test/**`, async (route) => {
    requests.push(route.request().url());
    await route.fulfill({ contentType: 'image/avif', body: await imageBody });
  });
  await page.route(/\/picks\/?(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: withCdnImages(await response.text()) });
  });
  return requests;
}

async function expectPreloadReused(page: Page, requests: string[], id: string) {
  const image = page.locator(`a[href="/picks/things/${id}"] [data-collection-image]`);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
    !element.hasAttribute('data-image-src') && element.complete && element.naturalWidth > 1,
  )).toBe(true);
  const currentSrc = await image.evaluate((element: HTMLImageElement) => element.currentSrc);
  const preload = page.locator('link[data-collection-preload]');
  await expect(preload).toHaveCount(1);
  await expect(preload).toHaveAttribute('imagesizes', await image.getAttribute('sizes') ?? '');
  await expect(preload).toHaveAttribute('imagesrcset', await image.locator('..').locator('source').getAttribute('srcset') ?? '');
  const measuredSizes = await image.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${Math.max(1, Math.ceil(element.getBoundingClientRect().width
      - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)))}px`;
  });
  await expect(preload).toHaveAttribute('imagesizes', measuredSizes);
  expect(new URL(currentSrc).searchParams.get('fm')).toBe('avif');
  expect(requests.filter((url) => new URL(url).pathname === new URL(imageUrl(id)).pathname))
    .toEqual([currentSrc]);
}

for (const { size, columns } of [{ size: 232, columns: 2 }, { size: 176, columns: 3 }]) {
  test(`${columns}-column saved layout fetches the LCP image before CSS and reuses that request`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'モバイルの保存列数に応じた先読みを検証する。');
    const requests = await installCdnImages(page);
    await page.addInitScript((saved) => sessionStorage.setItem('picks:image-size', String(saved)), size);
    let releaseCss!: () => void;
    const cssReady = new Promise<void>((resolve) => { releaseCss = resolve; });
    await page.route(/\/_astro\/[^/]+\.css(?:\?.*)?$/, async (route) => {
      await cssReady;
      await route.continue();
    });
    const navigation = page.goto('/picks');
    try {
      await expect.poll(() => requests.some((url) => url.startsWith(imageUrl('mountain-boots')))).toBe(true);
    } finally {
      releaseCss();
      await navigation;
    }
    await expectCollectionReady(page);
    await expect.poll(() => page.locator('[data-item-grid]').evaluate((grid) =>
      getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    )).toBe(columns);
    await expectPreloadReused(page, requests, 'mountain-boots');
  });
}

test('a category URL preloads its first image without fetching excluded items', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'モバイルのカテゴリ別先読みを検証する。');
  const requests = await installCdnImages(page);
  await page.goto('/picks?category=ski');
  await expectCollectionReady(page);
  await expectPreloadReused(page, requests, 'ski-skis');
  expect(requests.some((url) => url.startsWith(imageUrl('mountain-boots')))).toBe(false);
});

test('the preloaded CDN image remains available when external modules fail', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'モバイルのinline読み込み経路を検証する。');
  const requests = await installCdnImages(page);
  await page.route(/\/_astro\/[^/]+\.js(?:\?.*)?$/, (route) => route.abort());
  await page.goto('/picks');
  await expectPreloadReused(page, requests, 'mountain-boots');
});

test('desktop keeps measured image sizing without the mobile preload', async ({ page, isMobile }) => {
  test.skip(isMobile, 'PCでは実幅を測ってから取得する。');
  await page.setViewportSize({ width: 566, height: 800 });
  await page.goto('/picks');
  await expectCollectionReady(page);
  await expect(page.locator('link[data-collection-preload]')).toHaveCount(0);
  await expect.poll(() => page.locator('[data-collection-image]').first().evaluate((element: HTMLImageElement) =>
    !element.hasAttribute('data-image-src') && element.complete && element.naturalWidth > 1,
  )).toBe(true);
});
