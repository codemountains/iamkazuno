import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { collectionCardWidth, collectionSize, parseCollectionSize } from '../src/lib/collection-size';

test('stored sizes accept only supported range steps, including both endpoints', () => {
  for (const value of [88, 128, 136, 160, 280]) {
    assert.equal(parseCollectionSize(value), value);
    assert.equal(parseCollectionSize(String(value)), value);
  }
  for (const value of [null, undefined, {}, [], true, '', 'nope', 0, 80, 89, 127.9, 288, Infinity, NaN]) {
    assert.equal(parseCollectionSize(value), 160);
  }
});

test('card widths account for gaps and narrow screens without depending on the filtered count', () => {
  assert.equal(collectionCardWidth(343, 136, 12), 165.5);
  assert.equal(collectionCardWidth(288, 88, 12), 88);
  assert.equal(collectionCardWidth(288, 280, 12), 288);
  assert.equal(collectionCardWidth(1000, 160, 16), (1000 - 4 * 16) / 5);
  assert.equal(collectionCardWidth(60, 88, 12), 60);
  assert.equal(collectionCardWidth(0, 88, 12), 0);
});

const page = readFileSync(new URL('../src/pages/picks/index.astro', import.meta.url), 'utf8');
const prepare = page.match(/<script[^>]*data-size-prepare>([\s\S]*?)<\/script>/)?.[1];
if (!prepare) throw new Error('Collection size must be restored before cards are parsed.');

function initialSize(saved: string | null, mobile = false, blocked = false) {
  let applied: string | undefined;
  runInNewContext(prepare!, {
    collectionSize,
    window: { matchMedia: () => ({ matches: mobile }) },
    sessionStorage: { getItem: () => { if (blocked) throw new Error('Storage blocked'); return saved; } },
    document: { documentElement: { style: { setProperty: (_key: string, value: string) => { applied = value; } } } },
  });
  return applied;
}

test('saved size is restored before first paint and navigation restoration', () => {
  assert.equal(initialSize('88'), '88px');
  assert.equal(initialSize('280', true), '280px');
  assert.ok(page.indexOf('data-size-prepare') < page.indexOf('data-item-grid'));
  assert.ok(page.indexOf('  initCollectionSize();') < page.indexOf('  initCollectionNavigation();'));
});

test('missing, invalid or blocked storage retains responsive defaults', () => {
  for (const stored of [null, '', '88px', '89', '900', 'NaN']) {
    assert.equal(initialSize(stored), '160px');
    assert.equal(initialSize(stored, true), '136px');
  }
  assert.equal(initialSize('280', true, true), '136px');
});
