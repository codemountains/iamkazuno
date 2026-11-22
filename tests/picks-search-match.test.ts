import assert from 'node:assert/strict';
import test from 'node:test';
import { getPickSearchMatch, type MatchPart } from '../src/lib/picks-search-match';

const marked = (parts: MatchPart[]) => parts.filter((part) => part.matched).map((part) => part.text);
const shown = (parts: MatchPart[]) => parts.map((part) => part.text).join('');

test('title and brand highlights preserve the original width, case, kana and model separators', () => {
  const fields = { title: 'テント Ｘ－Ｍｉｄ', brand: 'Sample Objects' };
  for (const query of ['てんと xmid sample', 'テント X-Mid SAMPLE']) {
    const match = getPickSearchMatch(query, fields);
    assert.deepEqual(marked(match.title), ['テント', 'Ｘ－Ｍｉｄ']);
    assert.deepEqual(marked(match.brand), ['Sample']);
    assert.equal(shown(match.title), fields.title);
    assert.equal(match.detail, undefined);
  }
});

test('an alias match shows the registered model including its hyphen', () => {
  for (const query of ['ＳＣ－３５', 'SC35', 'sc 35']) {
    const match = getPickSearchMatch(query, { title: 'カメラ', aliases: ['コンパクトカメラ', 'SC-35'] });
    assert.equal(match.detail?.kind, 'alias');
    assert.deepEqual(marked(match.detail!.parts), ['SC-35']);
  }
});

test('a brand alias is highlighted in full when the title shares its first word', () => {
  const match = getPickSearchMatch('さんぷるおぶじぇくつ', {
    title: 'カメラ（サンプル 004）', aliases: ['サンプルオブジェクツ'],
  });
  assert.deepEqual(marked(match.detail!.parts), ['サンプルオブジェクツ']);
});

test('fuzzy matches identify the actual brand, alias, or words from the Pagefind excerpt', () => {
  const brand = getPickSearchMatch('samples', { title: 'ブーツ', brand: 'SAMPLE OBJECTS', matchedMetaFields: ['brand'] });
  assert.deepEqual(marked(brand.brand), ['SAMPLE']);
  const alias = getPickSearchMatch('SC36', {
    title: 'カメラ', aliases: ['コンパクトカメラ', 'SC-35'], matchedMetaFields: ['alias_labels', 'alias_1'],
  });
  assert.equal(alias.detail?.kind, 'alias');
  assert.deepEqual(marked(alias.detail!.parts), ['SC-35']);
  const body = getPickSearchMatch('カメラマン', {
    title: 'バッグ', description: '小さなカメラを持ち運べる。', excerpt: '小さな<mark>カメラ</mark>を持ち運べる。',
  });
  assert.equal(body.detail?.kind, 'description');
  assert.deepEqual(marked(body.detail!.parts), ['カメラ']);
});

test('the description excerpt uses original text and keeps long context and graphemes intact', () => {
  const description = '食' + '🏕️'.repeat(50) + '行動食と飲み物' + 'を持っていく。'.repeat(15);
  const match = getPickSearchMatch('行動食', { title: 'バックパック', description });
  const detail = match.detail!;
  assert.equal(detail.kind, 'description');
  assert.deepEqual(marked(detail.parts), ['行動食']);
  assert.ok(shown(detail.parts).startsWith('…' + '🏕️'.repeat(8) + '行動食と飲み物'));
  assert.ok(shown(detail.parts).endsWith('…'));
  const kana = getPickSearchMatch('ぱっく', { title: 'ﾊﾟｯｸ' });
  assert.deepEqual(marked(kana.title), ['ﾊﾟｯｸ']);
});

test('a multiword search can explain words outside the product title', () => {
  const fields = { title: 'バックパック', brand: 'ALPS', description: '行動食と飲み物', aliases: ['ザック'] };
  const match = getPickSearchMatch('ばっくぱっく 行動食', fields);
  assert.deepEqual(marked(match.title), ['バックパック']);
  assert.deepEqual(marked(match.detail!.parts), ['行動食']);
  assert.equal(getPickSearchMatch('バックパック', fields).detail, undefined);
  assert.equal(getPickSearchMatch('ski', fields).detail, undefined);
  assert.deepEqual(marked(getPickSearchMatch('', fields).title), []);
});

test('long vowels remain significant and HTML-looking text is returned verbatim as data', () => {
  const fields = { title: '<em>コーヒー</em>' };
  assert.deepEqual(marked(getPickSearchMatch('こーひー', fields).title), ['コーヒー']);
  assert.deepEqual(marked(getPickSearchMatch('コヒ', fields).title), []);
  assert.equal(shown(getPickSearchMatch('コーヒー', fields).title), fields.title);
});
