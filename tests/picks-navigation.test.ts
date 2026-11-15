import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryPath, collectionPath, thingPath } from '../src/lib/paths';
import { collectionReturnPosition, detailReturnPosition, parseReturnPosition } from '../src/scripts/picks-navigation';

const origin = 'https://iamkaz.uno';
const position = {
  listUrl: '/picks?category=mountain',
  detailPath: '/picks/things/tent',
  scrollY: 732,
  itemTop: 184,
};
const context = { position, currentDetailUrl: position.detailPath };
const departure = { ...context, fromUrl: position.listUrl };

function arrive(overrides: Partial<Parameters<typeof detailReturnPosition>[0]> = {}) {
  return detailReturnPosition({
    pending: departure,
    saved: null,
    navigationType: 'navigate',
    currentUrl: `${origin}${position.detailPath}`,
    referrer: `${origin}${position.listUrl}`,
    ...overrides,
  });
}

test('return position retains the selected category and exact viewport offset', () => {
  assert.deepEqual(parseReturnPosition(position), position);
  const all = { ...position, listUrl: '/picks', scrollY: 0, itemTop: -12.5 };
  assert.deepEqual(parseReturnPosition(all), all);
  const encoded = { ...position, listUrl: '/picks?category=mountain%20gear' };
  assert.deepEqual(parseReturnPosition(encoded), encoded);
});

test('invalid saved values cannot supply an external destination or invalid scroll coordinates', () => {
  for (const value of [undefined, null, false, 42, 'not an object', [], {}, { ...position, itemTop: undefined }]) {
    assert.equal(parseReturnPosition(value), null);
  }
  for (const listUrl of [
    'https://example.com/picks?category=mountain',
    '//example.com/picks',
    'javascript:alert(1)',
    '/',
    '/picks/things/tent',
    '/picks#collection',
    '/picks?category=mountain#collection',
  ]) {
    assert.equal(parseReturnPosition({ ...position, listUrl }), null, listUrl);
  }
  for (const detailPath of ['/picks', '/picks/things/', '/picks/things/tent/more', '/picks/things/tent?from=list', '/picks/things/tent#main', 'https://example.com/picks/things/tent']) {
    assert.equal(parseReturnPosition({ ...position, detailPath }), null, detailPath);
  }
  for (const scrollY of [-1, NaN, Infinity, -Infinity, '732', null]) {
    assert.equal(parseReturnPosition({ ...position, scrollY }), null);
  }
  for (const itemTop of [NaN, Infinity, -Infinity, '184', null]) {
    assert.equal(parseReturnPosition({ ...position, itemTop }), null);
  }
});

test('normal list-to-detail navigation restores only the clicked item and matching category', () => {
  assert.deepEqual(arrive(), position);
  assert.deepEqual(arrive({ referrer: `${origin}/picks/?category=mountain` }), position);
  assert.equal(arrive({ currentUrl: `${origin}/picks/things/backpack` }), null);
  for (const referrer of [
    '',
    'not a URL',
    `https://example.com${position.listUrl}`,
    `${origin}/picks`,
    `${origin}/picks?category=ski`,
    `${origin}/picks/things/backpack`,
  ]) {
    assert.equal(arrive({ referrer }), null, referrer);
  }
});

test('a direct visit never reuses an old detail entry or unrelated pending departure', () => {
  assert.equal(arrive({ pending: null, saved: context, referrer: '' }), null);
  assert.equal(arrive({ pending: null, saved: context }), null);
  assert.equal(arrive({ saved: context, referrer: '' }), null);
  assert.equal(arrive({
    pending: { ...departure, currentDetailUrl: '/picks/things/backpack' },
    saved: context,
  }), null);
  // 以前の保存形式を推測して引き継がず、通常のリンクとして表示する。
  assert.equal(arrive({ pending: position }), null);
});

test('reload and history traversal retain only the current detail entry context', () => {
  for (const navigationType of ['reload', 'back_forward']) {
    assert.deepEqual(arrive({ pending: null, saved: context, navigationType, referrer: '' }), position);
    assert.deepEqual(arrive({ pending: { ...departure, currentDetailUrl: '/picks/things/backpack' }, saved: context, navigationType }), position);
    assert.equal(arrive({ pending: departure, saved: null, navigationType }), null);
    assert.equal(arrive({ saved: { ...context, currentDetailUrl: '/picks/things/backpack' }, navigationType }), null);
    assert.equal(arrive({ saved: { ...context, position: { ...position, listUrl: 'https://example.com/picks' } }, navigationType }), null);
  }
});

test('successive detail visits retain the original collection item while checking each departure', () => {
  let fromUrl = position.detailPath;
  for (const currentDetailUrl of ['/picks/things/backpack', '/picks/things/boots', position.detailPath]) {
    const pending = { position, currentDetailUrl, fromUrl };
    assert.deepEqual(arrive({ pending, currentUrl: `${origin}${currentDetailUrl}`, referrer: `${origin}${fromUrl}` }), position);
    for (const referrer of ['', `${origin}${position.listUrl}`, `${origin}/picks/things/unrelated`, `https://example.com${fromUrl}`]) {
      assert.equal(arrive({ pending, currentUrl: `${origin}${currentDetailUrl}`, referrer }), null, referrer);
    }
    // 新しい詳細の履歴に保存すれば、リロード・戻る/進むでも元商品を失わない。
    for (const navigationType of ['reload', 'back_forward']) {
      assert.deepEqual(arrive({
        pending: null,
        saved: { position, currentDetailUrl },
        navigationType,
        currentUrl: `${origin}${currentDetailUrl}`,
        referrer: '',
      }), position);
    }
    fromUrl = currentDetailUrl;
  }
});

test('a detail opened separately cannot inherit context solely from its referrer or history', () => {
  const currentDetailUrl = '/picks/things/backpack';
  const saved = { position, currentDetailUrl };
  assert.equal(arrive({
    pending: null,
    saved,
    currentUrl: `${origin}${currentDetailUrl}`,
    referrer: `${origin}${position.detailPath}`,
  }), null);
  assert.equal(arrive({
    pending: { ...saved, fromUrl: position.detailPath },
    saved,
    currentUrl: `${origin}${currentDetailUrl}`,
    referrer: '',
  }), null);
});

test('detail context validates both destinations and departure URLs', () => {
  for (const currentDetailUrl of [
    '/picks', '/picks/things/', '/picks/things/tent/more', '/picks/things/tent#main',
    'https://example.com/picks/things/tent', '//example.com/picks/things/tent', 'javascript:alert(1)',
  ]) {
    assert.equal(arrive({ pending: { ...departure, currentDetailUrl } }), null, currentDetailUrl);
  }
  for (const fromUrl of [
    undefined, null, 42, '', '/', '/picks?category=ski', '/picks#collection',
    '/picks/things/tent#main', '/picks/things/tent/more',
    'https://example.com/picks/things/tent', '//example.com/picks/things/tent', 'javascript:alert(1)',
  ]) {
    assert.equal(arrive({ pending: { ...departure, fromUrl } }), null, String(fromUrl));
  }
  assert.equal(arrive({ pending: { ...departure, position: { ...position, scrollY: -1 } } }), null);
});

test('returning from a later detail checks that detail but restores the original item and category', () => {
  const currentDetailUrl = '/picks/things/backpack';
  const pending = { position: { ...position, restoreFocus: true }, currentDetailUrl };
  const options = { pending, currentUrl: `${origin}${position.listUrl}`, referrer: `${origin}${currentDetailUrl}` };
  assert.deepEqual(collectionReturnPosition(options), pending.position);
  assert.equal(collectionReturnPosition({ ...options, currentUrl: `${origin}/picks` }), null);
  assert.equal(collectionReturnPosition({ ...options, currentUrl: `${origin}/picks?category=ski` }), null);
  for (const referrer of ['', `${origin}${position.detailPath}`, `https://example.com${currentDetailUrl}`]) {
    assert.equal(collectionReturnPosition({ ...options, referrer }), null, referrer);
  }
  assert.equal(collectionReturnPosition({ ...options, pending: position }), null);
});

test('detail query strings are matched without changing the original collection item', () => {
  const currentDetailUrl = '/picks/things/backpack?view=compact';
  const fromUrl = '/picks/things/tent?from=share';
  const pending = { position, currentDetailUrl, fromUrl };
  const options = { pending, currentUrl: `${origin}${currentDetailUrl}`, referrer: `${origin}${fromUrl}` };
  assert.deepEqual(arrive(options), position);
  assert.equal(arrive({ ...options, referrer: `${origin}${position.detailPath}` }), null);
  assert.equal(arrive({ ...options, currentUrl: `${origin}/picks/things/backpack` }), null);
  assert.deepEqual(collectionReturnPosition({
    pending,
    currentUrl: `${origin}${position.listUrl}`,
    referrer: `${origin}${currentDetailUrl}`,
  }), position);
});

test('collection, category, and detail paths do not add collection fragments', () => {
  assert.equal(collectionPath, '/picks');
  assert.equal(categoryPath('mountain'), '/picks?category=mountain');
  assert.equal(categoryPath('ski & snow'), '/picks?category=ski%20%26%20snow');
  assert.equal(thingPath('tent'), '/picks/things/tent');
  for (const path of [collectionPath, categoryPath('mountain'), thingPath('tent')]) {
    assert.equal(new URL(path, origin).hash, '');
  }
});
