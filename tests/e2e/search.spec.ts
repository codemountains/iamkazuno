import type { Page } from '@playwright/test';
import { sampleThings } from '../../src/data/sample';
import { test, expect, expectCollectionReady } from './fixtures';

const visibleLinks = (page: Page) => page.locator('[data-item]:visible .item-card-link');

test('the grid resolves without fragments and only open suggestions load details, tolerating a missing fragment', async ({
  page,
}) => {
  const fragments: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/*.pf_fragment', async (route) => {
    fragments.push(route.request().url());
    const fail = fragments.length === 1;
    await gate;
    if (fail) await route.fulfill({ status: 404 });
    else await route.continue();
  });
  const query = '行動食';
  const total = sampleThings.filter((thing) => thing.description?.includes(query)).length;
  try {
    await page.goto('/picks?q=' + encodeURIComponent(query));
    await expect(visibleLinks(page)).toHaveCount(total);
    await expect(page.locator('[data-result-count]')).toHaveText(
      `${String(total).padStart(2, '0')} things`,
    );
    expect(fragments).toHaveLength(0);
    await page.getByRole('combobox').focus();
    await expect(page.getByRole('option')).toHaveCount(5);
    await expect.poll(() => fragments.length).toBe(5);
  } finally {
    release();
  }
  await expect(page.getByRole('option').locator('[data-match-kind="description"]')).toHaveCount(4);
  await expect(page.getByRole('option')).toHaveCount(5);
  await expect(visibleLinks(page)).toHaveCount(total);
  await expect(page.locator('[data-search-error]')).toBeHidden();
  expect(fragments).toHaveLength(5);
});

test('search is laid out with the filters and count, and is loaded on demand', async ({
  page,
  isMobile,
}) => {
  const searchRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/pagefind/'))
      searchRequests.push(request.url());
  });
  await page.goto('/picks');
  await expectCollectionReady(page);
  const filters = page.getByRole('group', { name: 'カテゴリで絞り込む' });
  const input = page.getByRole('combobox');
  const count = page.getByRole('status');
  await expect(input).toHaveAccessibleName(/.+/);
  const [filterRect, inputRect, countRect] = await Promise.all([
    filters.boundingBox(),
    input.boundingBox(),
    count.boundingBox(),
  ]);
  if (isMobile) {
    const toolbarRect = await page.locator('.collection-toolbar').boundingBox();
    expect(filterRect!.y + filterRect!.height).toBeLessThanOrEqual(inputRect!.y);
    expect(inputRect!.x).toBeCloseTo(toolbarRect!.x, 0);
    expect(inputRect!.width).toBeCloseTo(toolbarRect!.width, 0);
    expect(countRect!.width).toBeLessThanOrEqual(1);
    expect(countRect!.height).toBeLessThanOrEqual(1);
    await expect.poll(() => count.ariaSnapshot()).toContain(`${sampleThings.length} things`);
  } else {
    await expect(count).toBeInViewport();
    expect(
      Math.abs(inputRect!.y + inputRect!.height / 2 - (countRect!.y + countRect!.height / 2)),
    ).toBeLessThan(5);
    expect(filterRect!.x + filterRect!.width).toBeLessThanOrEqual(countRect!.x + 1);
    expect(countRect!.x + countRect!.width).toBeLessThanOrEqual(inputRect!.x + 1);
  }
  await filters.locator('[data-filter="mountain"]').click();
  expect(searchRequests).toEqual([]);
  await input.fill('カメラ');
  await expect(page.getByRole('link', { name: 'バックパック', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'ブーツ', exact: true })).toBeHidden();
  const suggestions = page.getByRole('listbox').getByRole('option');
  await expect(suggestions).toHaveCount(5);
  const cards = visibleLinks(page);
  const titles = await cards.locator('h2').allTextContents();
  await expect(suggestions).toContainText(titles.slice(0, 5));
  expect(searchRequests.length).toBeGreaterThan(0);
  const href = await cards.first().getAttribute('href');
  if (isMobile) await suggestions.first().tap();
  else await suggestions.first().click();
  await expect(page).toHaveURL(href!);
});

test('tapping a suggestion opens its product even if the keyboard dismisses during the tap', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Requires touch input');
  await page.goto('/picks');
  const input = page.getByRole('combobox');
  await input.tap();
  await input.fill('カメラ');
  const option = page.getByRole('option').nth(1);
  await expect(option).toBeVisible();
  const href = await option.getAttribute('href');
  // モバイルのエミュレーションには実機のキーボードがないため、指を離す前の blur を再現する。
  await input.evaluate((element) => {
    document.addEventListener('pointerdown', () => element.blur(), { once: true });
  });
  await option.tap();
  await expect(page).toHaveURL(href!);
});

test('name and description matches rank and filter existing cards, then restore their original order', async ({
  page,
}) => {
  await page.goto('/picks?q=' + encodeURIComponent('カメラ'));
  await expectCollectionReady(page);
  const cards = visibleLinks(page);
  const input = page.getByRole('combobox');
  await expect(input).toHaveValue('カメラ');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(page.getByRole('link', { name: 'ブーツ', exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: 'カメラ', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'バックパック', exact: true })).toBeVisible();
  const matches = await cards.evaluateAll((links) =>
    links.map((link) => link.getAttribute('href')),
  );
  expect(matches).toContain('/picks/things/other-camera');
  expect(matches).toContain('/picks/things/mountain-backpack');
  expect(matches.indexOf('/picks/things/other-camera')).toBeLessThan(
    matches.indexOf('/picks/things/mountain-backpack'),
  );
  await expect(page.locator('[data-results-label]')).toContainText(String(matches.length));

  await page.locator('[data-filter="mountain"]').click();
  await expect(page.getByRole('link', { name: 'カメラ', exact: true })).toBeHidden();
  await expect(page.getByRole('link', { name: 'バックパック', exact: true })).toBeVisible();
  await input.fill('фжцщфжцщ');
  await expect(cards).toHaveCount(0);
  await expect(page.getByRole('listbox')).toBeHidden();
  const empty = page.locator('[data-empty-state]');
  await expect(empty).toContainText('No matching things.');
  await expect(empty.locator('svg.empty-state-search-icon[aria-hidden="true"]')).toBeVisible();
  await input.fill('');
  await expect(page).toHaveURL('/picks?category=mountain');
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  const mountainPaths = sampleThings
    .filter((thing) => thing.ref_categories?.some((cat) => cat?.id === 'mountain'))
    .map((thing) => `/picks/things/${thing.id}`);
  await expect
    .poll(() => cards.evaluateAll((links) => links.map((link) => link.getAttribute('href'))))
    .toEqual(mountainPaths);
});

test('the remaining results button closes suggestions and preserves the filtered grid', async ({
  page,
  isMobile,
}) => {
  await page.goto('/picks');
  const input = page.getByRole('combobox');
  const list = page.getByRole('listbox');
  const more = page.getByRole('button', { name: /more things?/i });
  const cards = visibleLinks(page);
  const moreCount = more.locator('#picks-suggestions-more-count');
  await input.fill('02 山');
  await expect(cards).toHaveCount(6);
  await expect(moreCount).toHaveText('1 more thing');

  await page.locator('[data-filter="mountain"]').click();
  await input.fill('カメラ');
  await expect(cards).toHaveCount(9);
  await expect(list.getByRole('option')).toHaveCount(5);
  await expect(moreCount).toHaveText('4 more things');
  await expect(more).toHaveAccessibleName(/^4 more things\s*close suggestions$/i);
  await expect(list).toHaveAccessibleDescription('4 more things');
  await expect(list.getByRole('button')).toHaveCount(0);
  const url = page.url();
  const paths = () => cards.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  const filteredPaths = await paths();
  if (isMobile) await more.tap();
  else await more.click();
  await expect(list).toBeHidden();
  await expect(more).toBeHidden();
  await expect(input).toHaveValue('カメラ');
  await expect(page.locator('[data-result-count]')).toHaveText('09 things');
  await expect(page).toHaveURL(url);
  expect(await paths()).toEqual(filteredPaths);

  await input.click();
  await page.keyboard.press('ArrowUp');
  await expect(more).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    (await list.getByRole('option').first().getAttribute('id'))!,
  );
  await page.keyboard.press('ArrowUp');
  await expect(more).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();
  await expect(input).toBeFocused();

  await page.locator('[data-filter="myog"]').click();
  await input.focus();
  await expect(list.getByRole('option')).toHaveCount(1);
  await expect(list).toHaveAccessibleDescription('');
  await expect(more).toBeHidden();

  await page.locator('[data-filter="ski"]').click();
  await input.focus();
  await expect(cards).toHaveCount(0);
  await expect(list).toBeHidden();
  await expect(more).toBeHidden();
});

test('keyboard selection opens the selected suggestion and returns to a visible focused result', async ({
  page,
  isMobile,
}) => {
  await page.goto('/picks');
  await expectCollectionReady(page);
  if (isMobile) {
    const slider = page.getByRole('slider', { name: '画像サイズ' });
    await slider.press('End');
    await expect(slider).toHaveValue('280');
  }
  const input = page.getByRole('combobox');
  const list = page.getByRole('listbox');
  const options = list.getByRole('option');
  await input.fill('かめら');
  await expect(options).toHaveCount(5);
  await expect(options.first().locator('.picks-suggestion-title mark')).toHaveText('カメラ');
  await expect(options.first().locator('.picks-suggestion-detail')).toHaveCount(0);
  await expect(options.first()).toContainText('SAMPLE OBJECTS');
  await expect(input).toHaveAttribute('aria-controls', (await list.getAttribute('id'))!);
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    (await options.nth(0).getAttribute('id'))!,
  );
  await input.press('ArrowDown');
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    (await options.nth(1).getAttribute('id'))!,
  );
  await input.press('ArrowUp');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await input.press('Escape');
  await expect(input).toHaveValue('かめら');
  await expect(list).toBeHidden();
  await expect(input).toBeFocused();
  for (let index = 0; index < 5; index++) await page.keyboard.press('ArrowDown');
  await expect(options.last()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: /more things?/i })).toBeFocused();
  await expect(input).not.toHaveAttribute('aria-activedescendant');
  await page.keyboard.press('ArrowUp');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    (await options.last().getAttribute('id'))!,
  );
  await expect(options.last()).toHaveAttribute('aria-selected', 'true');
  const result = visibleLinks(page).nth(4);
  const resultPath = await result.getAttribute('href');
  if (isMobile) await expect(result).not.toBeInViewport();
  const collectionUrl = page.url();
  await input.press('Enter');
  await expect(page).toHaveURL(resultPath!);
  await page.getByRole('link', { name: 'Back to picks' }).press('Enter');
  await expect(page).toHaveURL(collectionUrl);
  await expect(input).toHaveValue('かめら');
  await expect(list).toBeHidden();
  await expect(result).toHaveAttribute('href', resultPath!);
  await expect(result).toBeFocused();
  await expect(result).toBeInViewport();
});

test('arrow keys wrap between products when all matches fit in the suggestions', async ({
  page,
}) => {
  await page.goto('/picks');
  const input = page.getByRole('combobox');
  const options = page.getByRole('option');
  await input.fill('未設定');
  await expect(options).toHaveCount(4);
  await expect(page.getByRole('button', { name: /more things?/i })).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(options.last()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await expect(input).toBeFocused();
});

test('IME confirmation cannot activate a stale suggestion', async ({ page }) => {
  await page.goto('/picks');
  await expectCollectionReady(page);
  const input = page.getByRole('combobox');
  const list = page.getByRole('listbox');
  await input.fill('ブーツ');
  await expect(list).toBeVisible();
  await input.press('ArrowDown');
  await input.dispatchEvent('compositionstart');
  await input.evaluate((el: HTMLInputElement) => {
    el.value = 'かめら';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  });
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  await expect(list).toBeHidden();
  expect(new URL(page.url()).searchParams.get('q')).toBe('ブーツ');
  await input.dispatchEvent('compositionend', { data: 'かめら' });
  await expect(list.getByRole('option').first()).toContainText('カメラ');
  await input.press('Tab');
  await expect(list).toBeHidden();
  await expect(visibleLinks(page).first()).toBeFocused();
});

test('Tab from search focuses the first result and preserves keyboard navigation', async ({
  page,
  browserName,
}) => {
  await page.goto('/picks?category=mountain');
  const input = page.getByRole('combobox');
  const options = page.getByRole('option');
  const cards = visibleLinks(page);
  await input.fill('カメラ');
  await expect(options).toHaveCount(5);
  // WebKit の標準設定では、ボタンやリンクを含む順次移動には Option+Tab を使う。
  const nativeTab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await input.press('Shift+' + nativeTab);
  await expect(page.locator('[data-filter-navigation] button:focus')).toHaveCount(1);
  await input.focus();
  await input.press('ArrowDown');
  await input.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await input.press('Tab');
  await expect(cards.first()).toBeFocused();
  await expect(page.getByRole('listbox')).toBeHidden();
  await page.keyboard.press(nativeTab);
  await expect(cards.nth(1)).toBeFocused();

  await input.fill('фжцщфжцщ');
  await expect(cards).toHaveCount(0);
  await input.press(nativeTab);
  await expect(page.getByRole('button', { name: 'Clear search' })).toBeFocused();
});

test('Tab immediately after typing focuses the first result of the pending search', async ({
  page,
  isMobile,
}) => {
  await page.goto('/picks');
  const input = page.getByRole('combobox');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/pagefind-entry.json*', async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await input.fill('カメラ');
    await input.press('Tab');
    if (isMobile) await expect(page.locator('[data-filter=""] .filter-count')).toBeVisible();
  } finally {
    release();
  }
  const first = visibleLinks(page).first();
  await expect(first).toHaveAttribute('href', '/picks/things/other-camera');
  await expect(first).toBeFocused();
  await expect(page.getByRole('listbox')).toBeHidden();
});

test('a full-width model number and hiragana brand alias find their products', async ({ page }) => {
  await page.goto('/picks');
  await expectCollectionReady(page);
  const input = page.getByRole('combobox');
  const cards = visibleLinks(page);
  await input.fill('ＳＣ－３５');
  await expect(cards).toHaveCount(1);
  await expect(cards).toHaveAttribute('href', '/picks/things/other-camera');
  const first = page.getByRole('option').first();
  await expect(first.locator('[data-match-kind="alias"] mark')).toHaveText('SC-35');
  await input.fill('SC35');
  await expect(first.locator('[data-match-kind="alias"] mark')).toHaveText('SC-35');

  await input.fill('さんぷるおぶじぇくつ');
  const brandedCount = sampleThings.filter(
    (thing) => thing.ref_brand?.id === 'sample-objects',
  ).length;
  await expect(cards).toHaveCount(brandedCount);
  await expect(first.locator('[data-match-kind="alias"] mark')).toHaveText('サンプルオブジェクツ');
  await expect(
    page.getByRole('link', { name: 'ブランド未設定のサンプル', exact: true }),
  ).toBeHidden();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(input).toHaveValue('');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(cards).toHaveCount(sampleThings.length);
});

test('a model season finds the corresponding pick and appears beside its suggestion title', async ({
  page,
}) => {
  await page.goto('/picks');
  await page.getByRole('combobox').fill('25-26');
  const suggestion = page.getByRole('option', { name: /スキー板 25-26/ });
  await expect(suggestion).toHaveAttribute(
    'href',
    new URL('/picks/things/ski-skis', page.url()).href,
  );
  await expect(suggestion.locator('.picks-suggestion-title')).toHaveText('スキー板');
  await expect(suggestion.locator('.picks-suggestion-title + .thing-variant mark')).toHaveText(
    '25-26',
  );
});

test('fuzzy matches show the registered model and the matching brand', async ({ page }) => {
  await page.goto('/picks');
  const input = page.getByRole('combobox');
  const first = page.getByRole('option').first();
  await input.fill('SC36');
  await expect(first.locator('[data-match-kind="alias"] mark')).toHaveText('SC-35');
  await input.fill('samples');
  await expect(first.locator('.picks-suggestion-brand mark')).toHaveText('SAMPLE');
});

test('description-only matches show a single-line excerpt with the original wording', async ({
  page,
}) => {
  await page.goto('/picks');
  await expectCollectionReady(page);
  await page.getByRole('combobox').fill('行動食');
  const pack = page
    .getByRole('option')
    .filter({ has: page.locator('.picks-suggestion-title', { hasText: /^バックパック$/ }) });
  const excerpt = pack.locator('[data-match-kind="description"]');
  await expect(excerpt).toContainText('行動食と飲み物');
  await expect(excerpt.locator('mark')).toHaveText('行動食');
  await expect(excerpt).toHaveCSS('white-space', 'nowrap');
});

test('query, category and focus are restored after returning from a search result', async ({
  page,
}) => {
  const listUrl = '/picks?category=mountain&q=' + encodeURIComponent('カメラ');
  await page.goto(listUrl);
  await expectCollectionReady(page);
  const link = page.getByRole('link', { name: 'バックパック', exact: true });
  await expect(page.getByRole('link', { name: 'ブーツ', exact: true })).toBeHidden();
  await link.press('Enter');
  await expect(page).toHaveURL('/picks/things/mountain-backpack');
  const back = page.getByRole('link', { name: 'Back to picks' });
  await expect(back).toHaveAttribute('href', listUrl);
  await back.press('Enter');
  await expect(page).toHaveURL(listUrl);
  await expect(page.getByRole('combobox')).toHaveValue('カメラ');
  await expect(link).toBeFocused();
  await expect(link).toBeInViewport();
  await expect(page.getByRole('link', { name: 'ブーツ', exact: true })).toBeHidden();
});

test('browser Back restores the focused result and its scroll position after a search', async ({
  page,
}) => {
  await page.goto('/picks?q=sample');
  const results = visibleLinks(page);
  await expect(results).toHaveCount(
    sampleThings.filter((thing) => thing.ref_brand !== null).length,
  );
  const link = results.nth(45);
  await link.focus();
  await link.scrollIntoViewIfNeeded();
  const href = await link.getAttribute('href');
  const top = (await link.boundingBox())!.y;
  await link.press('Enter');
  await expect(page).toHaveURL(href!);
  await page.goBack();
  await expect(page).toHaveURL('/picks?q=sample');
  const restored = page.locator(`.item-card-link[href="${href}"]`);
  await expect(restored).toBeFocused();
  await expect.poll(async () => Math.abs((await restored.boundingBox())!.y - top)).toBeLessThan(3);
});

for (const [asset, requestUrl] of [
  ['entry manifest', /\/pagefind-entry\.json(?:\?|$)/],
  ['index chunk', /\.pf_index(?:\?|$)/],
] as const) {
  test(`a failed ${asset} keeps category browsing available and can be retried`, async ({
    page,
  }) => {
    await page.route(requestUrl, (route) => route.abort());
    await page.goto('/picks?category=mountain&q=' + encodeURIComponent('カメラ'));
    const retry = page.getByRole('button', { name: 'Retry search' });
    await expect(retry).toBeVisible();
    await expect(page.getByRole('link', { name: 'ブーツ', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'スキー板 25-26', exact: true })).toBeHidden();
    await expect(page.locator('[data-empty-state]')).toBeHidden();
    await page.unroute(requestUrl);
    await retry.press('Enter');
    await expect(page.getByRole('combobox')).toBeFocused();
    await expect(page.getByRole('link', { name: 'ブーツ', exact: true })).toBeHidden();
    await expect(page.getByRole('link', { name: 'バックパック', exact: true })).toBeVisible();
    await expect(retry).toBeHidden();
  });
}

test('category counts follow the query and a category with zero results can show all matches', async ({
  page,
}) => {
  const query = '行動食';
  await page.goto('/picks?category=ski');
  const categories = page.getByRole('group', { name: 'カテゴリで絞り込む' });
  const count = (id: string) => categories.locator(`[data-filter="${id}"] .filter-count`);
  const skiTotal = sampleThings.filter((thing) =>
    thing.ref_categories?.some((category) => category?.id === 'ski'),
  ).length;
  async function expectTotals() {
    for (const [id, total] of Object.entries({ '': sampleThings.length, ski: skiTotal })) {
      await expect(count(id)).toBeVisible();
      await expect(count(id)).toHaveText(String(total));
    }
  }
  await expectTotals();
  await page.getByRole('combobox').fill(query);
  const showAll = page.getByRole('button', {
    name: 'View 9 things across all categories',
    exact: true,
  });
  await expect(showAll).toBeVisible();
  await expect.poll(() => page.getByRole('status').ariaSnapshot()).toMatch(/ski.*00 things/s);
  await expect(visibleLinks(page)).toHaveCount(0);
  for (const [id, total] of Object.entries({ '': 9, mountain: 9, myog: 1, ski: 0, other: 0 })) {
    await expect(count(id)).toBeVisible();
    await expect(count(id)).toHaveText(String(total));
  }
  await showAll.click();
  await expect(visibleLinks(page)).toHaveCount(9);
  await expect(page.getByRole('combobox')).toHaveValue(query);
  expect(new URL(page.url()).searchParams.has('category')).toBe(false);
  await expect(showAll).toBeHidden();

  await page.goBack();
  await expect(showAll).toBeVisible();
  await expect(visibleLinks(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expectTotals();
  await expect(page).toHaveURL('/picks?category=ski');
  await expect(showAll).toBeHidden();
});

test('phrases copied from Japanese descriptions find their original products', async ({ page }) => {
  await page.goto('/picks');
  await expectCollectionReady(page);
  for (const [phrase, name] of [
    ['出番まで', 'ゴーグル'],
    ['感触を確かめながら', 'ブーツ'],
    ['寸法を決められる', 'スタッフサック'],
  ]) {
    await page.getByRole('combobox').fill(phrase);
    const expected = sampleThings.filter((thing) => thing.description?.includes(phrase));
    await expect(visibleLinks(page)).toHaveCount(expected.length);
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  }
});
