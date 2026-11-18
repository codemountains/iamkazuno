import type { Page } from '@playwright/test';
import { sampleNotes } from '../../src/data/sample-notes';
import { test, expect } from './fixtures';

const photoNote = sampleNotes.find((note) => note.id === 'sample-note')!;
const photoPath = `/notes/${photoNote.id}`;
const photos = photoNote.note_photo?.photo_list ?? [];
const photoIntervalMs = 3_500;

async function firstNote(page: Page) {
  const link = page.locator('.note-list .note-entry').first();
  await expect(link).toBeVisible();
  const title = (await link.getByRole('heading', { level: 2 }).innerText()).trim();
  const href = await link.getAttribute('href');
  expect(href).toMatch(/^\/notes\/[^/]+$/);
  return { link, title, href: href! };
}

test('home opens the notes list, readers can open an article with the keyboard and return', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '/notes', exact: true }).click();
  await expect(page).toHaveURL('/notes');
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link', { name: '/notes ホーム' })).toHaveAttribute('href', '/notes');
  await expect(page.locator('.note-list .note-entry')).toHaveCount(Math.min(sampleNotes.length, 10));
  await expect(page.locator('.notes-count')).toHaveAttribute('aria-label', `${sampleNotes.length}件`);
  await expect(page.getByRole('navigation', { name: 'ノート一覧のページ送り' })).toHaveCount(sampleNotes.length > 10 ? 1 : 0);
  await expect(page.getByRole('heading', { level: 2, name: sampleNotes[0].title! })).toBeVisible();

  const dates = await page.locator('.note-list time').evaluateAll((elements) =>
    elements.map((element) => Date.parse(element.getAttribute('datetime') ?? '')),
  );
  expect(dates.length).toBeGreaterThan(0);
  expect(dates.every(Number.isFinite)).toBe(true);
  expect(dates).toEqual([...dates].sort((a, b) => b - a));

  const { link, title, href } = await firstNote(page);
  await expect(link.locator('time')).toHaveText('2026.11.17');
  await expect(link.locator('.note-excerpt')).not.toBeEmpty();
  await expect(link.locator('.note-excerpt').locator('*')).toHaveCount(0);
  await link.focus();
  await link.press('Enter');
  await expect(page).toHaveURL(href);
  await expect(page.locator('main article').getByRole('heading', { level: 1 })).toHaveText(title);
  await expect(page.locator('.note-heading time')).toHaveText('2026.11.17');
  await expect(page.locator('.note-body')).not.toBeEmpty();
  await expect(page.locator('.note-body').getByRole('heading', { name: '書きながら、考える' })).toBeVisible();
  await expect(page.locator('.note-body blockquote')).toContainText('とりとめのないことにも、書き留める場所を。');
  await expect(page.locator('.note-body').getByRole('link', { name: 'お気に入りのもの' })).toHaveAttribute('href', '/picks');

  await page.getByRole('link', { name: 'Back to notes', exact: true }).click();
  await expect(page).toHaveURL('/notes');
  await expect(page.locator(`.note-entry[href="${href}"]`)).toBeVisible();
});

test('notes have their own canonical URLs and article metadata', async ({ page }) => {
  await page.goto('/notes');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://iamkaz.uno/notes');
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', '/notes');
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website');

  const { link, title, href } = await firstNote(page);
  await link.click();
  await expect(page).toHaveTitle(`${title} — /notes`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://iamkaz.uno${href}`);
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', `https://iamkaz.uno${href}`);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', '/notes');
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description?.trim()).toBeTruthy();
  expect(description).not.toMatch(/<\/?(?:p|h[1-6]|a|strong|em)\b/i);
  // サンプルデータを使うビルドが検索対象にならないことも確認する。
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
});

test('manual theme choice persists while moving between notes and picks', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/notes');
  const toggle = page.getByRole('switch', { name: 'ダークモード' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.locator('.site-footer a[href="/picks"]').first().click();
  await expect(page).toHaveURL('/picks');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await page.locator('.site-footer a[href="/notes"]').first().click();
  await expect(page).toHaveURL('/notes');
  const { link } = await firstNote(page);
  await link.click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('the list and article stay within a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/notes');
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);

  const { link } = await firstNote(page);
  await link.click();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.note-body')).toBeVisible();
  await expect(page.locator('.note-body pre code')).not.toBeEmpty();
  await expect(page.locator('.note-body table')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )).toBeLessThanOrEqual(1);
});

test('note photos advance in view and support stopping, restarting, and manual navigation', async ({ page }) => {
  await page.clock.install();
  await page.goto(photoPath);
  const gallery = page.locator('.note-photos');
  const images = gallery.locator('.note-photos-track img');
  const count = gallery.locator('.note-photos-count');
  const stop = gallery.getByRole('button', { name: '自動再生を停止' });
  const start = gallery.getByRole('button', { name: '自動再生を開始' });
  const total = photos.length;
  expect(total).toBeGreaterThan(1);
  await expect(images).toHaveCount(total);
  const body = (await page.locator('.note-body').boundingBox())!;
  expect((await gallery.boundingBox())!.y).toBeGreaterThanOrEqual(body.y + body.height - 1);

  await expect(stop).toBeVisible();
  await expect(gallery).not.toBeInViewport();
  await page.clock.fastForward(photoIntervalMs);
  await expect(count).toHaveText(`1 / ${total}`);
  await gallery.scrollIntoViewIfNeeded();
  await expect(images.first()).toBeInViewport();
  await expect(images.nth(1)).not.toBeInViewport({ ratio: 0.05 });
  await page.clock.fastForward(photoIntervalMs);
  await expect(count).toHaveText(`2 / ${total}`);
  await expect(images.nth(1)).toBeInViewport();
  await expect(images.first()).not.toBeInViewport({ ratio: 0.05 });

  await stop.click();
  await expect(start).toBeVisible();
  await page.clock.fastForward(photoIntervalMs);
  await expect(count).toHaveText(`2 / ${total}`);
  await start.click();
  await expect(stop).toBeVisible();
  await page.clock.fastForward(photoIntervalMs);
  const next = (2 % total) + 1;
  await expect(count).toHaveText(`${next} / ${total}`);

  await gallery.getByRole('button', { name: '前の写真' }).click();
  await expect(start).toBeVisible();
  await page.clock.fastForward(photoIntervalMs);
  await expect(count).toHaveText(`2 / ${total}`);
});

test('reduced motion starts paused and keyboard navigation wraps at both ends', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto(photoPath);
  const gallery = page.locator('.note-photos');
  const images = gallery.locator('.note-photos-track img');
  const count = gallery.locator('.note-photos-count');
  const total = photos.length;
  await gallery.scrollIntoViewIfNeeded();
  await expect(gallery.getByRole('button', { name: '自動再生を開始' })).toBeVisible();
  await page.clock.fastForward(photoIntervalMs);
  await expect(count).toHaveText(`1 / ${total}`);
  await gallery.getByRole('button', { name: '前の写真' }).press('Enter');
  await expect(count).toHaveText(`${total} / ${total}`);
  await expect(images.last()).toBeInViewport();
  await gallery.getByRole('button', { name: '次の写真' }).press('Enter');
  await expect(count).toHaveText(`1 / ${total}`);
  await expect(images.first()).toBeInViewport();
});

test('portrait photos fit inside the slide without cropping', async ({ page }) => {
  await page.route(`**${photos[0].url}`, (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="480"><rect width="240" height="480" fill="teal"/></svg>',
  }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(photoPath);
  const track = page.locator('.note-photos-track');
  const portrait = track.locator('img').first();
  await track.scrollIntoViewIfNeeded();
  await expect.poll(() => portrait.evaluate((image: HTMLImageElement) =>
    image.complete && image.naturalHeight > image.naturalWidth && image.naturalWidth > 0,
  )).toBe(true);
  await expect(portrait).toHaveCSS('object-fit', 'contain');
  const frame = (await track.boundingBox())!;
  const image = (await portrait.boundingBox())!;
  expect(image.x).toBeGreaterThanOrEqual(frame.x - 1);
  expect(image.y).toBeGreaterThanOrEqual(frame.y - 1);
  expect(image.x + image.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
  expect(image.y + image.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('readers can scroll from the first photo to the last', async ({ page }) => {
    await page.goto(photoPath);
    const gallery = page.locator('.note-photos');
    const track = gallery.locator('.note-photos-track');
    const images = track.locator('img');
    await expect(gallery.getByRole('button')).toHaveCount(0);
    await track.scrollIntoViewIfNeeded();
    await expect(images.first()).toBeInViewport();
    await expect(images.last()).not.toBeInViewport();
    await track.evaluate((element) => element.scrollTo({ left: element.scrollWidth, behavior: 'instant' }));
    await expect(images.last()).toBeInViewport();
    await expect(images.first()).not.toBeInViewport();
  });

  test('notes remain readable and navigable', async ({ page }) => {
    await page.goto('/notes');
    await expect(page.locator('[data-theme-toggle]')).toBeHidden();
    const { link, title, href } = await firstNote(page);
    await link.click();
    await expect(page).toHaveURL(href);
    await expect(page.locator('main article').getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.locator('.note-body')).not.toBeEmpty();
    await page.getByRole('link', { name: 'Back to notes', exact: true }).click();
    await expect(page).toHaveURL('/notes');
    await expect(page.locator(`.note-entry[href="${href}"]`)).toBeVisible();
  });
});
