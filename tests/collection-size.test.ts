import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { collectionSize, mobileCollectionColumns, parseCollectionSize } from '../src/lib/collection-size';

test('stored sizes accept only supported range steps, including both endpoints', () => {
  for (const value of [88, 128, 136, 160, 280]) {
    assert.equal(parseCollectionSize(value), value);
    assert.equal(parseCollectionSize(String(value)), value);
  }
  for (const value of [null, undefined, {}, [], true, '', 'nope', 0, 80, 89, 127.9, 288, Infinity, NaN]) {
    assert.equal(parseCollectionSize(value), 160);
  }
});

test('mobile offers six to one columns, with three at the center and by default', () => {
  assert.equal(mobileCollectionColumns(collectionSize.min), 6);
  assert.equal(mobileCollectionColumns((collectionSize.min + collectionSize.max) / 2), 3);
  assert.equal(mobileCollectionColumns(collectionSize.mobileInitial), 3);
  assert.equal(mobileCollectionColumns(collectionSize.max), 1);
  const columns = [];
  for (let size = collectionSize.min; size <= collectionSize.max; size += collectionSize.step) {
    columns.push(mobileCollectionColumns(size));
  }
  assert.deepEqual([...new Set(columns)], [6, 5, 4, 3, 2, 1]);
  assert.deepEqual(columns, [...columns].sort((a, b) => b - a));
});

const page = readFileSync(new URL('../src/pages/picks/index.astro', import.meta.url), 'utf8');
const prepare = page.match(/<script[^>]*data-size-prepare>([\s\S]*?)<\/script>/)?.[1];
if (!prepare) throw new Error('Collection size must be restored before cards are parsed.');

function initialLayout(saved: string | null, mobile = false, blocked = false) {
  const applied: Record<string, string> = {};
  runInNewContext(prepare!, {
    collectionSize,
    window: { matchMedia: () => ({ matches: mobile }) },
    sessionStorage: { getItem: () => { if (blocked) throw new Error('Storage blocked'); return saved; } },
    document: { documentElement: { style: { setProperty: (key: string, value: string) => { applied[key] = value; } } } },
  });
  return applied;
}

test('saved size is restored before first paint and navigation restoration', () => {
  assert.equal(initialLayout('88')['--collection-item-size'], '88px');
  assert.equal(initialLayout('280', true)['--collection-item-size'], '280px');
  for (let size = collectionSize.min; size <= collectionSize.max; size += collectionSize.step) {
    const layout = initialLayout(String(size), true);
    assert.equal(layout['--collection-mobile-columns'], String(mobileCollectionColumns(size)));
  }
  assert.ok(page.indexOf('data-size-prepare') < page.indexOf('data-item-grid'));
  assert.ok(page.indexOf('  initCollectionSize();') < page.indexOf('  initCollectionNavigation();'));
});

test('missing, invalid or blocked storage retains responsive defaults', () => {
  for (const stored of [null, '', '88px', '89', '900', 'NaN']) {
    assert.equal(initialLayout(stored)['--collection-item-size'], '160px');
    assert.equal(initialLayout(stored, true)['--collection-item-size'], '184px');
    assert.equal(initialLayout(stored, true)['--collection-mobile-columns'], '3');
  }
  assert.equal(initialLayout('280', true, true)['--collection-mobile-columns'], '3');
});
