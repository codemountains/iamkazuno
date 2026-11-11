import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryPath, collectionPath, thingPath } from '../src/lib/paths';
import { detailReturnPosition, parseReturnPosition } from '../src/scripts/picks-navigation';

const origin = 'https://iamkaz.uno';
const position = {
  listUrl: '/picks?category=mountain',
  detailPath: '/picks/things/tent',
  scrollY: 732,
  itemTop: 184,
};

function arrive(overrides: Partial<Parameters<typeof detailReturnPosition>[0]> = {}) {
  return detailReturnPosition({
    pending: position,
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
  assert.equal(arrive({ pending: null, saved: position, referrer: '' }), null);
  assert.equal(arrive({ pending: null, saved: position }), null);
  assert.equal(arrive({ saved: position, referrer: '' }), null);
  assert.equal(arrive({
    pending: { ...position, detailPath: '/picks/things/backpack' },
    saved: position,
  }), null);
});

test('reload and history traversal retain only the current detail entry context', () => {
  for (const navigationType of ['reload', 'back_forward']) {
    assert.deepEqual(arrive({ pending: null, saved: position, navigationType, referrer: '' }), position);
    assert.deepEqual(arrive({ pending: { ...position, detailPath: '/picks/things/backpack' }, saved: position, navigationType }), position);
    assert.equal(arrive({ pending: position, saved: null, navigationType }), null);
    assert.equal(arrive({ saved: { ...position, detailPath: '/picks/things/backpack' }, navigationType }), null);
    assert.equal(arrive({ saved: { ...position, listUrl: 'https://example.com/picks' }, navigationType }), null);
  }
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
